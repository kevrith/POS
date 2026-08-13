import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Alert, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { canApprove } from '../lib/roles';
import { parseQty, DAMAGE_REASONS } from '../lib/receiving';
import { Colors } from '../constants/theme';

interface DamagedRecord {
  id: string;
  itemId: string;
  quantity: number;
  costCents: number;
  reason: string;
  notes?: string | null;
  status: string;
  createdAt: string;
  item?: { name?: string } | null;
}

interface CatalogItem { id: string; name: string; costPriceCents?: number; retailPriceCents: number }

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';

const STATUS_COLOR: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.success,
  REJECTED: Colors.error,
};

/**
 * Breakages, spoilage and theft — logged by whoever finds them, written off by a
 * manager.
 *
 * Keeping the log on the floor matters: a shattered crate recorded at the shelf
 * is a stock correction, the same crate remembered at the end of the week is a
 * guess.
 */
export default function DamagedGoodsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { businessId, storeId } = useActiveStore();
  const isApprover = canApprove(user?.role);

  const [filter, setFilter] = useState<Filter>('PENDING');
  const [showForm, setShowForm] = useState(false);
  const [itemId, setItemId] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(DAMAGE_REASONS[0]);
  const [notes, setNotes] = useState('');

  const listQ = useQuery<DamagedRecord[]>({
    queryKey: ['damaged-goods', storeId, filter],
    queryFn: () =>
      mobileApi.get<DamagedRecord[]>(
        `/damaged-goods?storeId=${storeId}` + (filter === 'all' ? '' : `&status=${filter}`),
      ),
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const itemsQ = useQuery<CatalogItem[]>({
    queryKey: ['items', businessId, storeId],
    queryFn: () => mobileApi.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: showForm && !!businessId && !!storeId,
    staleTime: 5 * 60_000,
  });

  const createMut = useMutation({
    mutationFn: () => {
      const item = (itemsQ.data ?? []).find((i) => i.id === itemId);
      const qty = parseQty(quantity);
      return mobileApi.post('/damaged-goods', {
        businessId,
        storeId,
        itemId,
        quantity: qty,
        // Value the loss at cost where the item carries one — writing it off at
        // retail would overstate the hit in the shrinkage report.
        costCents: (item?.costPriceCents ?? 0) * qty,
        reason,
        notes: notes.trim() || undefined,
        submittedBy: user?.id,
      });
    },
    onSuccess: () => {
      setShowForm(false);
      setItemId(''); setItemSearch(''); setQuantity(''); setNotes(''); setReason(DAMAGE_REASONS[0]);
      qc.invalidateQueries({ queryKey: ['damaged-goods'] });
      Alert.alert('Logged', 'The write-off is waiting for a manager to approve.');
    },
    onError: (e: any) => Alert.alert('Could not log', e?.message ?? 'Please try again.'),
  });

  const decideMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) =>
      mobileApi.patch(`/damaged-goods/${id}/${action}`, { authorizedBy: user?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damaged-goods'] });
      // An approved write-off moves stock.
      qc.invalidateQueries({ queryKey: ['items'] });
    },
    onError: (e: any) => Alert.alert('Could not update', e?.message ?? 'Please try again.'),
  });

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = itemsQ.data ?? [];
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 30) : list.slice(0, 30);
  }, [itemsQ.data, itemSearch]);

  const selectedItem = (itemsQ.data ?? []).find((i) => i.id === itemId);

  function submit() {
    if (!itemId) {
      Alert.alert('Pick an item', 'Choose which product was damaged.');
      return;
    }
    if (parseQty(quantity) === 0) {
      Alert.alert('Enter a quantity', 'How many units were lost?');
      return;
    }
    createMut.mutate();
  }

  function confirmDecision(r: DamagedRecord, action: 'approve' | 'reject') {
    Alert.alert(
      action === 'approve' ? 'Approve write-off?' : 'Reject write-off?',
      action === 'approve'
        ? `${r.quantity} × ${r.item?.name ?? 'item'} will be removed from stock.`
        : `${r.quantity} × ${r.item?.name ?? 'item'} stays in stock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'approve' ? 'Approve' : 'Reject',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => decideMut.mutate({ id: r.id, action }),
        },
      ],
    );
  }

  const rows = listQ.data ?? [];
  const lost = rows.filter((r) => r.status === 'APPROVED').reduce((sum, r) => sum + r.costCents, 0);

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Damaged Goods</Text>
        <TouchableOpacity onPress={() => setShowForm(true)} style={s.backBtn}>
          <Ionicons name="add" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.filterRow}>
        {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
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
          {lost > 0 && (
            <View style={s.totalCard}>
              <Text style={s.totalLabel}>Stock written off (shown)</Text>
              <Text style={s.totalValue}>{formatKES(lost)}</Text>
            </View>
          )}

          {rows.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>Nothing here. Tap + to log a breakage.</Text>
            </View>
          ) : (
            rows.map((r) => (
              <View key={r.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.itemName}>{r.item?.name ?? 'Item'}</Text>
                  <View style={[s.statusPill, { backgroundColor: (STATUS_COLOR[r.status] ?? Colors.textSecondary) + '1A' }]}>
                    <Text style={[s.statusText, { color: STATUS_COLOR[r.status] ?? Colors.textSecondary }]}>{r.status}</Text>
                  </View>
                </View>
                <Text style={s.qty}>{r.quantity} units · {r.reason}</Text>
                {r.notes ? <Text style={s.notes}>{r.notes}</Text> : null}
                <View style={s.rowBetween}>
                  <Text style={s.meta}>
                    {new Date(r.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                  </Text>
                  {r.costCents > 0 && <Text style={s.cost}>{formatKES(r.costCents)}</Text>}
                </View>

                {isApprover && r.status === 'PENDING' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity style={[s.actionBtn, s.rejectBtn]} onPress={() => confirmDecision(r, 'reject')} disabled={decideMut.isPending}>
                      <Ionicons name="close" size={16} color={Colors.error} />
                      <Text style={[s.actionText, { color: Colors.error }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.approveBtn]} onPress={() => confirmDecision(r, 'approve')} disabled={decideMut.isPending}>
                      <Ionicons name="checkmark" size={16} color="#FFF" />
                      <Text style={[s.actionText, { color: '#FFF' }]}>Write off</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={() => setShowForm(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Log Damage</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
              <Text style={s.label}>Item</Text>
              {selectedItem ? (
                <TouchableOpacity style={s.selectedItem} onPress={() => setItemId('')}>
                  <Text style={s.selectedItemText}>{selectedItem.name}</Text>
                  <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              ) : (
                <>
                  <TextInput
                    style={s.input}
                    value={itemSearch}
                    onChangeText={setItemSearch}
                    placeholder="Search products"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  {itemsQ.isLoading ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginTop: 12 }} />
                  ) : (
                    filteredItems.map((i) => (
                      <TouchableOpacity key={i.id} style={s.pickRow} onPress={() => { setItemId(i.id); setItemSearch(''); }}>
                        <Text style={s.pickName}>{i.name}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              <Text style={s.label}>Quantity lost</Text>
              <TextInput style={s.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.textSecondary} />

              <Text style={s.label}>Reason</Text>
              <View style={s.chipWrap}>
                {DAMAGE_REASONS.map((r) => (
                  <TouchableOpacity key={r} style={[s.chip, reason === r && s.chipActive]} onPress={() => setReason(r)}>
                    <Text style={[s.chipText, reason === r && { color: '#FFF' }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Notes</Text>
              <TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder="What happened? (optional)" placeholderTextColor={Colors.textSecondary} />
            </ScrollView>

            <TouchableOpacity style={[s.btn, createMut.isPending && { opacity: 0.7 }]} onPress={submit} disabled={createMut.isPending}>
              {createMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={s.btnText}>Log Damage</Text></>
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
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.background },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  totalCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, alignItems: 'center', gap: 2 },
  totalLabel: { fontSize: 12, color: Colors.textSecondary },
  totalValue: { fontSize: 21, fontWeight: '800', color: Colors.error },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  qty: { fontSize: 13, color: Colors.text },
  notes: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  cost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  muted: { fontSize: 13, color: Colors.textSecondary },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  approveBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.error + '14' },
  actionText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  selectedItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primary + '12', borderRadius: 10, padding: 14 },
  selectedItemText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickName: { fontSize: 14, color: Colors.text },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
