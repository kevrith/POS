import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { mobileApi, formatKES } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { buildAdjustmentPayload, AdjustMode } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface ItemDetail {
  id: string;
  name: string;
  barcode?: string;
  retailPriceCents: number;
  costPriceCents?: number;
  currentStock?: number;
  trackStock?: boolean;
  isActive?: boolean;
  soldOut?: boolean;
  category?: { name: string } | null;
}

interface Movement {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  notes?: string;
  source?: string;
}

const MODE_LABELS: Record<AdjustMode, { title: string; verb: string; icon: keyof typeof Ionicons.glyphMap }> = {
  RECEIVE: { title: 'Receive Stock', verb: 'Add to stock (delivery)', icon: 'arrow-down-circle' },
  REMOVE: { title: 'Remove Stock', verb: 'Wastage / loss / breakage', icon: 'arrow-up-circle' },
  SET: { title: 'Set Exact Count', verb: 'Correct to a counted number', icon: 'create' },
};

export default function ManageItemScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { businessId, storeId } = useActiveStore();

  const [mode, setMode] = useState<AdjustMode | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const itemQ = useQuery<ItemDetail>({
    queryKey: ['manage-item', id, businessId],
    queryFn: () => mobileApi.get<ItemDetail>(`/items/${id}?businessId=${businessId}`),
    enabled: !!id && !!businessId,
  });

  const movesQ = useQuery<Movement[]>({
    queryKey: ['manage-item-moves', id, storeId],
    queryFn: () => mobileApi.get<Movement[]>(`/inventory/movements/${id}?storeId=${storeId}&limit=30`),
    enabled: !!id && !!storeId,
  });

  const item = itemQ.data;
  const currentStock = item?.currentStock ?? 0;

  const adjustMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildAdjustmentPayload>) =>
      mobileApi.post('/inventory/adjustment', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-item', id] });
      qc.invalidateQueries({ queryKey: ['manage-item-moves', id] });
      qc.invalidateQueries({ queryKey: ['manage-stock'] });
      qc.invalidateQueries({ queryKey: ['manage-low-stock'] });
      closeModal();
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Failed to update stock.'),
  });

  const toggleMutation = useMutation({
    mutationFn: (action: '86' | 'active') =>
      action === '86'
        ? mobileApi.patch(`/items/${id}/86?businessId=${businessId}`, {})
        : mobileApi.patch(`/items/${id}/toggle-active?businessId=${businessId}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manage-item', id] }),
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Failed to update item.'),
  });

  function closeModal() {
    setMode(null);
    setAmount('');
    setNotes('');
  }

  function submitAdjustment() {
    if (!mode || !item) return;
    const payload = buildAdjustmentPayload({
      itemId: item.id,
      storeId,
      businessId,
      mode,
      amount: parseFloat(amount),
      currentStock,
      notes,
    });
    if (!payload) {
      Alert.alert('No change', 'Enter an amount that changes the current stock.');
      return;
    }
    adjustMutation.mutate(payload);
  }

  if (itemQ.isLoading || !item) {
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
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{item.name}</Text>
        <TouchableOpacity onPress={() => router.push(`/manage-item-form?id=${item.id}`)} style={styles.iconBtn}>
          <Ionicons name="pencil" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={itemQ.isRefetching} onRefresh={() => { itemQ.refetch(); movesQ.refetch(); }} colors={[Colors.primary]} />}
      >
        {/* Stock summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Current Stock</Text>
          <Text style={styles.summaryStock}>{item.trackStock === false ? '—' : currentStock}</Text>
          <View style={styles.priceRow}>
            <View style={styles.priceItem}>
              <Text style={styles.priceLabel}>Price</Text>
              <Text style={styles.priceValue}>{formatKES(item.retailPriceCents)}</Text>
            </View>
            {item.costPriceCents != null && (
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Cost</Text>
                <Text style={styles.priceValue}>{formatKES(item.costPriceCents)}</Text>
              </View>
            )}
            {item.barcode ? (
              <View style={styles.priceItem}>
                <Text style={styles.priceLabel}>Barcode</Text>
                <Text style={styles.priceValue} numberOfLines={1}>{item.barcode}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Stock actions */}
        {item.trackStock !== false && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.success }]} onPress={() => setMode('RECEIVE')}>
              <Ionicons name="arrow-down-circle" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Receive</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.warning }]} onPress={() => setMode('REMOVE')}>
              <Ionicons name="arrow-up-circle" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.indigo }]} onPress={() => setMode('SET')}>
              <Ionicons name="create" size={18} color="#FFFFFF" />
              <Text style={styles.actionBtnText}>Set</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Availability toggles */}
        <View style={styles.toggleCard}>
          <TouchableOpacity style={styles.toggleRow} onPress={() => toggleMutation.mutate('86')}>
            <Ionicons name={item.soldOut ? 'eye-off' : 'eye'} size={18} color={item.soldOut ? Colors.error : Colors.success} />
            <Text style={styles.toggleText}>{item.soldOut ? 'Marked sold out (86) — tap to restore' : 'Available — tap to 86 (sold out)'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleRow, styles.toggleBorder]} onPress={() => toggleMutation.mutate('active')}>
            <Ionicons name="power" size={18} color={item.isActive === false ? Colors.error : Colors.success} />
            <Text style={styles.toggleText}>{item.isActive === false ? 'Inactive — tap to activate' : 'Active — tap to deactivate'}</Text>
          </TouchableOpacity>
        </View>

        {/* Movement history */}
        <Text style={styles.sectionTitle}>Recent Movements</Text>
        {movesQ.isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />
        ) : (movesQ.data?.length ?? 0) === 0 ? (
          <Text style={styles.emptyMoves}>No stock movements yet.</Text>
        ) : (
          <View style={styles.movesCard}>
            {movesQ.data!.map((m, idx) => (
              <View key={m.id} style={[styles.moveRow, idx > 0 && styles.moveBorder]}>
                <Ionicons
                  name={m.quantity >= 0 ? 'add-circle' : 'remove-circle'}
                  size={16}
                  color={m.quantity >= 0 ? Colors.success : Colors.error}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.moveType}>{m.type.replace(/_/g, ' ')}</Text>
                  <Text style={styles.moveDate}>{new Date(m.createdAt).toLocaleString('en-KE')}{m.notes ? ` · ${m.notes}` : ''}</Text>
                </View>
                <Text style={[styles.moveQty, { color: m.quantity >= 0 ? Colors.success : Colors.error }]}>
                  {m.quantity >= 0 ? '+' : ''}{m.quantity}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Adjustment Modal */}
      <Modal visible={!!mode} animationType="slide" transparent onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {mode && (
              <>
                <View style={styles.modalHeader}>
                  <Ionicons name={MODE_LABELS[mode].icon} size={22} color={Colors.primary} />
                  <Text style={styles.modalTitle}>{MODE_LABELS[mode].title}</Text>
                  <TouchableOpacity onPress={closeModal}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalHint}>{MODE_LABELS[mode].verb}</Text>
                <Text style={styles.modalCurrent}>Current: {currentStock}</Text>

                <Text style={styles.label}>{mode === 'SET' ? 'New counted quantity' : 'Quantity'}</Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={Colors.textSecondary}
                  autoFocus
                />
                <Text style={styles.label}>Notes (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Supplier delivery #123"
                  placeholderTextColor={Colors.textSecondary}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, adjustMutation.isPending && { opacity: 0.7 }]}
                  onPress={submitAdjustment}
                  disabled={adjustMutation.isPending}
                >
                  {adjustMutation.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                      <Text style={styles.saveBtnText}>Confirm</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    gap: 8,
  },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryLabel: { fontSize: 12, color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryStock: { fontSize: 44, fontWeight: '900', color: Colors.text },
  priceRow: { flexDirection: 'row', gap: 20, marginTop: 10 },
  priceItem: { alignItems: 'center', maxWidth: 110 },
  priceLabel: { fontSize: 11, color: Colors.textSecondary },
  priceValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  toggleCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  toggleBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  toggleText: { fontSize: 13, color: Colors.text, flex: 1 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyMoves: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  movesCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  moveBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  moveType: { fontSize: 13, fontWeight: '600', color: Colors.text },
  moveDate: { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  moveQty: { fontSize: 16, fontWeight: '800' },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    gap: 8,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: Colors.text },
  modalHint: { fontSize: 13, color: Colors.textSecondary },
  modalCurrent: { fontSize: 13, color: Colors.text, fontWeight: '600', marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    marginTop: 14,
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
