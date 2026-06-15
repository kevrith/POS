import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { Colors } from '../constants/theme';

interface Settings {
  name: string;
  taxType?: string;
  serviceChargeRate?: number;
  serviceChargeDefault?: boolean;
  tablePrefix?: string;
  receiptHeader?: string;
  receiptFooter?: string;
}

const TAX_TYPES = ['VAT', 'TOT', 'NONE'];

export default function ManageSettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { businessId } = useActiveStore();

  const [name, setName] = useState('');
  const [taxType, setTaxType] = useState('VAT');
  const [serviceCharge, setServiceCharge] = useState('');
  const [serviceDefault, setServiceDefault] = useState(false);
  const [tablePrefix, setTablePrefix] = useState('');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['business-settings-full', businessId],
    queryFn: () => mobileApi.get<Settings>(`/business/${businessId}/settings`),
    enabled: !!businessId,
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name ?? '');
    setTaxType(data.taxType ?? 'VAT');
    setServiceCharge(data.serviceChargeRate != null ? String(data.serviceChargeRate) : '');
    setServiceDefault(!!data.serviceChargeDefault);
    setTablePrefix(data.tablePrefix ?? '');
    setReceiptHeader(data.receiptHeader ?? '');
    setReceiptFooter(data.receiptFooter ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      mobileApi.patch(`/business/${businessId}/settings`, {
        name: name.trim(),
        taxType,
        serviceChargeRate: serviceCharge ? Number(serviceCharge) : undefined,
        serviceChargeDefault: serviceDefault,
        tablePrefix: tablePrefix.trim() || undefined,
        receiptHeader: receiptHeader.trim() || undefined,
        receiptFooter: receiptFooter.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['business-settings-full'] });
      qc.invalidateQueries({ queryKey: ['business-settings'] });
      Alert.alert('Saved', 'Business settings updated.');
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Could not save settings.'),
  });

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Settings</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field label="Business Name">
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Business name" placeholderTextColor={Colors.textSecondary} />
          </Field>

          <Text style={styles.label}>Tax Type</Text>
          <View style={styles.chipRow}>
            {TAX_TYPES.map((t) => (
              <TouchableOpacity key={t} style={[styles.chip, taxType === t && styles.chipActive]} onPress={() => setTaxType(t)}>
                <Text style={[styles.chipText, taxType === t && { color: '#FFFFFF' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Service Charge (%)">
            <TextInput style={styles.input} value={serviceCharge} onChangeText={setServiceCharge} keyboardType="numeric" placeholder="10" placeholderTextColor={Colors.textSecondary} />
          </Field>
          <View style={styles.switchRow}>
            <Text style={styles.switchTitle}>Apply service charge by default</Text>
            <Switch value={serviceDefault} onValueChange={setServiceDefault} trackColor={{ true: Colors.primary }} thumbColor={serviceDefault ? Colors.primary : '#f4f3f4'} />
          </View>

          <Field label="Table Prefix">
            <TextInput style={styles.input} value={tablePrefix} onChangeText={setTablePrefix} placeholder="T" placeholderTextColor={Colors.textSecondary} autoCapitalize="characters" />
          </Field>
        </View>

        <Text style={styles.sectionTitle}>Receipt</Text>
        <View style={styles.card}>
          <Field label="Header">
            <TextInput style={[styles.input, styles.multiline]} value={receiptHeader} onChangeText={setReceiptHeader} placeholder="Shown at top of receipts" placeholderTextColor={Colors.textSecondary} multiline />
          </Field>
          <Field label="Footer">
            <TextInput style={[styles.input, styles.multiline]} value={receiptFooter} onChangeText={setReceiptFooter} placeholder="e.g. Thank you, come again!" placeholderTextColor={Colors.textSecondary} multiline />
          </Field>
        </View>

        <TouchableOpacity style={[styles.saveBtn, save.isPending && { opacity: 0.7 }]} onPress={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? <ActivityIndicator color="#FFFFFF" /> : (
            <><Ionicons name="checkmark" size={20} color="#FFFFFF" /><Text style={styles.saveBtnText}>Save Settings</Text></>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  multiline: { minHeight: 56, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchTitle: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
