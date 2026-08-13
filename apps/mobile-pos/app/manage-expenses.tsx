import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Alert, RefreshControl, Modal, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { canApprove } from '../lib/roles';
import { offlineId } from '../lib/manage-helpers';
import { parseAmountToCents } from '../lib/dayClose';
import { Colors } from '../constants/theme';

/** Same list the web Expenses page offers, so categories stay comparable in reports. */
const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Supplies', 'Transport',
  'Marketing', 'Equipment', 'Maintenance', 'Insurance', 'Other',
];
const PAYMENT_METHODS = ['CASH', 'MPESA', 'BANK', 'CHEQUE'];

interface Expense {
  id: string;
  amountCents: number;
  category: string;
  description: string;
  paidBy: string;
  approvalStatus: string;
  submittedBy: string;
  vatReclaimable: boolean;
  vatAmountCents: number;
  createdAt: string;
}

type Filter = 'all' | 'PENDING' | 'APPROVED' | 'REJECTED';

const STATUS_COLOR: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.success,
  REJECTED: Colors.error,
};

/**
 * Petty cash: record money going out, and (for managers) clear what other people
 * submitted.
 *
 * Expenses auto-approve under the business's approval threshold and land as
 * PENDING above it, so a cashier recording a KES 200 boda fare never waits on
 * anyone while a KES 50,000 payment still needs a manager.
 */
export default function ExpensesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { businessId, storeId } = useActiveStore();
  const isApprover = canApprove(user?.role);

  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Supplies');
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState('CASH');
  const [vatReclaimable, setVatReclaimable] = useState(false);

  const listQ = useQuery<Expense[]>({
    queryKey: ['expenses', businessId, filter],
    queryFn: () =>
      mobileApi.get<Expense[]>(
        `/expenses?businessId=${businessId}` + (filter === 'all' ? '' : `&approvalStatus=${filter}`),
      ),
    enabled: !!businessId,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (amountCents: number) =>
      mobileApi.post('/expenses', {
        offlineId: offlineId(),
        businessId,
        storeId,
        amountCents,
        category,
        description: description.trim(),
        paidBy,
        submittedBy: user?.id ?? '',
        vatReclaimable,
        // 16% VAT extracted from a VAT-inclusive amount, matching the pricing
        // convention used across the app.
        vatAmountCents: vatReclaimable ? Math.round((amountCents * 16) / 116) : 0,
      }),
    onSuccess: (created: any) => {
      resetForm();
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      Alert.alert(
        'Expense recorded',
        created?.approvalStatus === 'PENDING'
          ? 'It is above the approval limit, so a manager has to approve it.'
          : 'Saved.',
      );
    },
    onError: (e: any) => Alert.alert('Could not save', e?.message ?? 'Please try again.'),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      mobileApi.patch(`/expenses/${id}/${action}`, { approvedBy: user?.id ?? '' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e: any) => Alert.alert('Could not update', e?.message ?? 'Please try again.'),
  });

  function resetForm() {
    setAmount(''); setDescription(''); setCategory('Supplies');
    setPaidBy('CASH'); setVatReclaimable(false);
  }

  function submit() {
    const cents = parseAmountToCents(amount);
    if (cents === null || cents === 0) {
      Alert.alert('Enter an amount', 'Type how much was spent, e.g. 250');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Add a description', 'Say what the money was for — it appears in the expense report.');
      return;
    }
    createMut.mutate(cents);
  }

  function confirmDecision(e: Expense, action: 'approve' | 'reject') {
    Alert.alert(
      action === 'approve' ? 'Approve expense?' : 'Reject expense?',
      `${formatKES(e.amountCents)} — ${e.description}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => decideMut.mutate({ id: e.id, action }),
        },
      ],
    );
  }

  const rows = listQ.data ?? [];
  const total = rows
    .filter((r) => r.approvalStatus === 'APPROVED')
    .reduce((sum, r) => sum + r.amountCents, 0);
  const pendingCount = rows.filter((r) => r.approvalStatus === 'PENDING').length;

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Expenses</Text>
        <TouchableOpacity onPress={() => setShowForm(true)} style={s.backBtn}>
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.filterRow}>
        {(['all', 'PENDING', 'APPROVED', 'REJECTED'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              {f === 'PENDING' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {listQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={listQ.isRefetching} onRefresh={() => void listQ.refetch()} colors={[Colors.primary]} />}
        >
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>Approved spend shown</Text>
            <Text style={s.totalValue}>{formatKES(total)}</Text>
          </View>

          {rows.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>No expenses here yet. Tap + to record one.</Text>
            </View>
          ) : (
            rows.map((e) => (
              <View key={e.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.amount}>{formatKES(e.amountCents)}</Text>
                  <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[e.approvalStatus] ?? Colors.textSecondary) + '1A' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[e.approvalStatus] ?? Colors.textSecondary }]}>
                      {e.approvalStatus}
                    </Text>
                  </View>
                </View>
                <Text style={s.desc}>{e.description}</Text>
                <View style={s.metaRow}>
                  <Text style={s.meta}>{e.category}</Text>
                  <Text style={s.metaDot}>·</Text>
                  <Text style={s.meta}>{e.paidBy}</Text>
                  <Text style={s.metaDot}>·</Text>
                  <Text style={s.meta}>
                    {new Date(e.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                  </Text>
                  {e.vatReclaimable && (
                    <>
                      <Text style={s.metaDot}>·</Text>
                      <Text style={[s.meta, { color: Colors.primary }]}>VAT {formatKES(e.vatAmountCents)}</Text>
                    </>
                  )}
                </View>

                {isApprover && e.approvalStatus === 'PENDING' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.rejectBtn]}
                      onPress={() => confirmDecision(e, 'reject')}
                      disabled={decideMut.isPending}
                    >
                      <Ionicons name="close" size={16} color={Colors.error} />
                      <Text style={[s.actionText, { color: Colors.error }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.approveBtn]}
                      onPress={() => confirmDecision(e, 'approve')}
                      disabled={decideMut.isPending}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                      <Text style={[s.actionText, { color: '#FFF' }]}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Record expense ── */}
      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Record Expense</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
              <Text style={s.label}>Amount (KES)</Text>
              <TextInput
                style={s.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={Colors.textSecondary}
                autoFocus
              />

              <Text style={s.label}>What was it for?</Text>
              <TextInput
                style={s.input}
                value={description}
                onChangeText={setDescription}
                placeholder="e.g. Boda delivery to Westlands"
                placeholderTextColor={Colors.textSecondary}
              />

              <Text style={s.label}>Category</Text>
              <View style={s.chipWrap}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
                    <Text style={[s.chipText, category === c && { color: '#FFF' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Paid by</Text>
              <View style={s.chipWrap}>
                {PAYMENT_METHODS.map((m) => (
                  <TouchableOpacity key={m} style={[s.chip, paidBy === m && s.chipActive]} onPress={() => setPaidBy(m)}>
                    <Text style={[s.chipText, paidBy === m && { color: '#FFF' }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={s.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.switchTitle}>VAT reclaimable</Text>
                  <Text style={s.switchSub}>Supplier gave an ETR receipt</Text>
                </View>
                <Switch
                  value={vatReclaimable}
                  onValueChange={setVatReclaimable}
                  trackColor={{ true: Colors.primary }}
                  thumbColor={vatReclaimable ? Colors.primary : '#f4f3f4'}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[s.btn, createMut.isPending && { opacity: 0.7 }]}
              onPress={submit}
              disabled={createMut.isPending}
            >
              {createMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={s.btnText}>Save Expense</Text></>
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.background },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  totalCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, alignItems: 'center', gap: 2 },
  totalLabel: { fontSize: 12, color: Colors.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '800', color: Colors.text },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 17, fontWeight: '800', color: Colors.text },
  desc: { fontSize: 14, color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  metaDot: { fontSize: 12, color: Colors.border },
  muted: { fontSize: 13, color: Colors.textSecondary },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  approveBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.error + '14' },
  actionText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  switchTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  switchSub: { fontSize: 12, color: Colors.textSecondary },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
