import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Alert, Modal, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { parseAmountToCents } from '../lib/dayClose';
import { Colors } from '../constants/theme';

interface Supplier {
  id: string;
  name: string;
  contact?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  creditLimitCents?: number | null;
  outstandingBalanceCents: number;
}

const PAYMENT_TERMS = ['Cash on delivery', 'Net 7', 'Net 14', 'Net 30', 'Net 60'];

/**
 * Supplier contacts and what is owed to each.
 *
 * The phone-shaped part is calling them: a delivery is short, and the person
 * holding the phone needs the number now. Contact is tappable for that reason.
 */
export default function SuppliersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { businessId } = useActiveStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [creditLimit, setCreditLimit] = useState('');

  const listQ = useQuery<Supplier[]>({
    queryKey: ['suppliers', businessId],
    queryFn: () => mobileApi.get<Supplier[]>(`/suppliers?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });

  const createMut = useMutation({
    mutationFn: () =>
      mobileApi.post('/suppliers', {
        businessId,
        name: name.trim(),
        contact: contact.trim() || undefined,
        address: address.trim() || undefined,
        paymentTerms,
        creditLimitCents: parseAmountToCents(creditLimit) ?? undefined,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName(''); setContact(''); setAddress(''); setCreditLimit(''); setPaymentTerms('Net 30');
      qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e: any) => Alert.alert('Could not save', e?.message ?? 'Please try again.'),
  });

  function submit() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter the supplier name.');
      return;
    }
    createMut.mutate();
  }

  const rows = listQ.data ?? [];
  const owed = rows.reduce((sum, r) => sum + (r.outstandingBalanceCents ?? 0), 0);

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Suppliers</Text>
        <TouchableOpacity onPress={() => setShowForm(true)} style={s.backBtn}>
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {listQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={listQ.isRefetching} onRefresh={() => void listQ.refetch()} colors={[Colors.primary]} />}
        >
          {owed > 0 && (
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Total owed to suppliers</Text>
              <Text style={s.totalValue}>{formatKES(owed)}</Text>
            </View>
          )}

          {rows.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>No suppliers yet. Tap + to add the first one.</Text>
            </View>
          ) : (
            rows.map((sup) => (
              <View key={sup.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.name}>{sup.name}</Text>
                  {sup.outstandingBalanceCents > 0 && (
                    <Text style={s.owed}>{formatKES(sup.outstandingBalanceCents)}</Text>
                  )}
                </View>
                {sup.paymentTerms ? <Text style={s.meta}>{sup.paymentTerms}</Text> : null}
                {sup.address ? <Text style={s.meta}>{sup.address}</Text> : null}
                {sup.contact ? (
                  <TouchableOpacity
                    style={s.contactRow}
                    onPress={() => Linking.openURL(`tel:${sup.contact}`).catch(() => {})}
                  >
                    <Ionicons name="call-outline" size={15} color={Colors.primary} />
                    <Text style={s.contactText}>{sup.contact}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add Supplier</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              <Text style={s.label}>Name</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} placeholder="e.g. Bidco Africa" placeholderTextColor={Colors.textSecondary} autoFocus />

              <Text style={s.label}>Phone / contact</Text>
              <TextInput style={s.input} value={contact} onChangeText={setContact} placeholder="07xx xxx xxx" placeholderTextColor={Colors.textSecondary} keyboardType="phone-pad" />

              <Text style={s.label}>Address</Text>
              <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="Optional" placeholderTextColor={Colors.textSecondary} />

              <Text style={s.label}>Payment terms</Text>
              <View style={s.chipWrap}>
                {PAYMENT_TERMS.map((t) => (
                  <TouchableOpacity key={t} style={[s.chip, paymentTerms === t && s.chipActive]} onPress={() => setPaymentTerms(t)}>
                    <Text style={[s.chipText, paymentTerms === t && { color: '#FFF' }]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Credit limit (KES)</Text>
              <TextInput style={s.input} value={creditLimit} onChangeText={setCreditLimit} keyboardType="numeric" placeholder="Optional" placeholderTextColor={Colors.textSecondary} />
            </ScrollView>

            <TouchableOpacity style={[s.btn, createMut.isPending && { opacity: 0.7 }]} onPress={submit} disabled={createMut.isPending}>
              {createMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={s.btnText}>Save Supplier</Text></>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  totalCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, alignItems: 'center', gap: 2 },
  totalLabel: { fontSize: 12, color: Colors.textSecondary },
  totalValue: { fontSize: 21, fontWeight: '800', color: Colors.text },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  owed: { fontSize: 14, fontWeight: '700', color: Colors.warning },
  meta: { fontSize: 12, color: Colors.textSecondary },
  muted: { fontSize: 13, color: Colors.textSecondary },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  contactText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
