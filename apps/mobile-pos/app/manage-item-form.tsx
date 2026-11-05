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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { toCents, centsToInput, validateItemForm } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface ItemDetail {
  id: string;
  name: string;
  barcode?: string;
  retailPriceCents: number;
  costPriceCents?: number;
  trackStock?: boolean;
  category?: { name: string } | null;
}

export default function ManageItemFormScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id, barcode: scannedBarcode } = useLocalSearchParams<{ id?: string; barcode?: string }>();
  const { businessId, storeId } = useActiveStore();
  const isEdit = !!id;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  // Prefill the barcode when arriving from a "scan → add new" flow.
  const [barcode, setBarcode] = useState(scannedBarcode ?? '');
  const [category, setCategory] = useState('');
  const [trackStock, setTrackStock] = useState(true);
  const [initialStock, setInitialStock] = useState('');

  const itemQ = useQuery<ItemDetail>({
    queryKey: ['manage-item', id, businessId],
    queryFn: () => mobileApi.get<ItemDetail>(`/items/${id}?businessId=${businessId}`),
    enabled: isEdit && !!businessId,
  });

  useEffect(() => {
    const it = itemQ.data;
    if (!it) return;
    setName(it.name);
    setPrice(centsToInput(it.retailPriceCents));
    setCost(centsToInput(it.costPriceCents));
    setBarcode(it.barcode ?? '');
    setCategory(it.category?.name ?? '');
    setTrackStock(it.trackStock !== false);
  }, [itemQ.data]);

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      isEdit
        ? mobileApi.patch(`/items/${id}?businessId=${businessId}`, body)
        : mobileApi.post('/items', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-stock'] });
      qc.invalidateQueries({ queryKey: ['manage-item', id] });
      qc.invalidateQueries({ queryKey: ['manage-low-stock'] });
      // Refresh the POS catalog so a newly created item shows up without a manual refresh.
      qc.invalidateQueries({ queryKey: ['items'] });
      Alert.alert('Saved', `Item ${isEdit ? 'updated' : 'created'}.`);
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Failed to save item.'),
  });

  function handleSave() {
    const err = validateItemForm({ name, priceKes: price });
    if (err) {
      Alert.alert('Required', err);
      return;
    }
    const common = {
      name: name.trim(),
      retailPriceCents: toCents(price),
      costPriceCents: cost ? toCents(cost) : undefined,
      barcode: barcode.trim() || undefined,
      categoryName: category.trim() || undefined,
      trackStock,
    };
    if (isEdit) {
      mutation.mutate(common);
    } else {
      mutation.mutate({
        ...common,
        type: 'PRODUCT',
        businessId,
        storeId,
        initialStock: trackStock && initialStock ? Number(initialStock) : undefined,
      });
    }
  }

  if (isEdit && itemQ.isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Item' : 'New Item'}</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field label="Name *">
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Item name" placeholderTextColor={Colors.textSecondary} />
          </Field>
          <Field label="Selling Price (KES) *">
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
          </Field>
          <Field label="Cost Price (KES)">
            <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
          </Field>
          <Field label="Barcode">
            <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="Scan or type" placeholderTextColor={Colors.textSecondary} autoCapitalize="none" />
          </Field>
          <Field label="Category">
            <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Drinks" placeholderTextColor={Colors.textSecondary} />
          </Field>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Track stock</Text>
              <Text style={styles.switchDesc}>Keep a counted inventory for this item.</Text>
            </View>
            <Switch value={trackStock} onValueChange={setTrackStock} trackColor={{ true: Colors.primary }} thumbColor={trackStock ? Colors.primary : '#f4f3f4'} />
          </View>

          {!isEdit && trackStock && (
            <Field label="Opening Stock">
              <TextInput style={styles.input} value={initialStock} onChangeText={setInitialStock} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textSecondary} />
            </Field>
          )}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, mutation.isPending && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>{isEdit ? 'Save Changes' : 'Create Item'}</Text>
            </>
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
  content: { padding: 16, gap: 16, paddingBottom: 48 },
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 },
  switchTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  switchDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
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
