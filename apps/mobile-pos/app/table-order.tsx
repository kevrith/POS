import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Alert, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import {
  orderTotalCents, unsentLines, buildAddItemsPayload, STATION_LABELS, type KotStation, type OrderLine,
} from '../lib/hospitality';
import { Colors } from '../constants/theme';

interface MenuItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: { name?: string } | string | null;
}

interface OrderDetail {
  id: string;
  status: string;
  tableId?: string | null;
  table?: { number: string } | null;
  items: OrderLine[];
  kots?: Array<{ id: string; kotNumber: number; station?: KotStation; status: string }>;
}

/**
 * A single table's open bill: what has been ordered, what still has to go to the
 * kitchen, and the two actions that end the visit — fire the order, then ask for
 * the bill so the till can take payment.
 */
export default function TableOrderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { businessId, storeId } = useActiveStore();

  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<Record<string, number>>({});

  const orderQ = useQuery<OrderDetail>({
    queryKey: ['order', orderId],
    queryFn: () => mobileApi.get<OrderDetail>(`/hospitality/orders/${orderId}`),
    enabled: !!orderId,
    staleTime: 5_000,
  });

  const menuQ = useQuery<MenuItem[]>({
    queryKey: ['items', businessId, storeId],
    queryFn: () => mobileApi.get<MenuItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: picking && !!businessId && !!storeId,
    staleTime: 5 * 60_000,
  });

  const addMut = useMutation({
    mutationFn: () => {
      const picks = Object.entries(draft)
        .map(([itemId, quantity]) => {
          const item = (menuQ.data ?? []).find((m) => m.id === itemId);
          return item
            ? { itemId, name: item.name, quantity, unitPriceCents: item.retailPriceCents }
            : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
      return mobileApi.post(`/hospitality/orders/${orderId}/items`, {
        items: buildAddItemsPayload(picks),
      });
    },
    onSuccess: () => {
      setDraft({});
      setPicking(false);
      setSearch('');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e: any) => Alert.alert('Could not add items', e?.message ?? 'Please try again.'),
  });

  const fireMut = useMutation({
    mutationFn: (itemIds: string[]) =>
      mobileApi.post(`/hospitality/orders/${orderId}/kot`, { type: 'NEW_ORDER', itemIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['kitchen'] });
      Alert.alert('Sent to kitchen', 'The kitchen has the ticket.');
    },
    onError: (e: any) => {
      Alert.alert('Could not send', e?.message ?? 'Please try again.');
      // "Already sent" means another phone got there first; show the bill as it is now.
      qc.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });

  const serveMut = useMutation({
    mutationFn: (kotId: string) => mobileApi.patch(`/hospitality/kot/${kotId}/status`, { status: 'SERVED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['kitchen'] });
    },
    onError: (e: any) => Alert.alert('Could not update the ticket', e?.message ?? 'Please try again.'),
  });

  const billMut = useMutation({
    mutationFn: () => mobileApi.post(`/hospitality/orders/${orderId}/request-bill`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      Alert.alert('Bill requested', 'Take payment on the POS screen to close the table.');
    },
    onError: (e: any) => Alert.alert('Could not request the bill', e?.message ?? 'Please try again.'),
  });

  const cancelMut = useMutation({
    mutationFn: () => mobileApi.post(`/hospitality/orders/${orderId}/cancel`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      router.back();
    },
    onError: (e: any) => Alert.alert('Could not cancel', e?.message ?? 'Please try again.'),
  });

  const order = orderQ.data;
  const lines = order?.items ?? [];
  const total = orderTotalCents(lines);
  const pending = unsentLines(lines);

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = menuQ.data ?? [];
    return q ? list.filter((m) => m.name.toLowerCase().includes(q)) : list;
  }, [menuQ.data, search]);

  const draftCount = Object.values(draft).reduce((a, b) => a + b, 0);

  function bump(id: string, by: number) {
    setDraft((d) => {
      const next = Math.max(0, (d[id] ?? 0) + by);
      const copy = { ...d };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel this table?',
      'The order is discarded and the table goes back to free. Use this only if the guests left without ordering.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel order', style: 'destructive', onPress: () => cancelMut.mutate() },
      ],
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {order?.table?.number ? `Table ${order.table.number}` : 'Order'}
        </Text>
        <TouchableOpacity onPress={confirmCancel} style={s.backBtn}>
          <Ionicons name="trash-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </View>

      {orderQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={s.content}
            refreshControl={<RefreshControl refreshing={orderQ.isRefetching} onRefresh={() => void orderQ.refetch()} colors={[Colors.primary]} />}
          >
            {lines.length === 0 ? (
              <View style={s.card}>
                <Text style={s.muted}>Nothing ordered yet. Tap “Add items” to start the bill.</Text>
              </View>
            ) : (
              <View style={s.card}>
                {lines.map((l) => (
                  <View key={l.id} style={s.lineRow}>
                    <Text style={s.lineQty}>{l.quantity}×</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineName}>{l.name}</Text>
                      {l.specialInstructions ? (
                        <Text style={s.lineNote}>{l.specialInstructions}</Text>
                      ) : null}
                      {!l.sentToKitchenAt && <Text style={s.notFired}>not sent to kitchen</Text>}
                    </View>
                    <Text style={s.linePrice}>{formatKES(l.totalCents)}</Text>
                  </View>
                ))}
                <View style={s.divider} />
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>Bill total</Text>
                  <Text style={s.totalValue}>{formatKES(total)}</Text>
                </View>
              </View>
            )}

            {order?.kots && order.kots.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Kitchen tickets</Text>
                {order.kots.map((k) => (
                  <View key={k.id} style={s.kotRow}>
                    <Text style={s.kotNumber}>
                      #{k.kotNumber}{k.station ? ` ${STATION_LABELS[k.station] ?? k.station}` : ''}
                    </Text>
                    <Text style={[s.kotStatus, k.status === 'READY' && { color: Colors.success }]}>
                      {k.status === 'IN_PROGRESS' ? 'COOKING' : k.status}
                    </Text>
                    {k.status === 'READY' && (
                      <TouchableOpacity
                        style={s.servedBtn}
                        onPress={() => serveMut.mutate(k.id)}
                        disabled={serveMut.isPending}
                        accessibilityLabel={`Mark ticket ${k.kotNumber} served`}
                      >
                        <Text style={s.servedText}>Served</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity style={[s.footBtn, s.ghostBtn]} onPress={() => setPicking(true)}>
              <Ionicons name="add" size={18} color={Colors.primary} />
              <Text style={[s.footBtnText, { color: Colors.primary }]}>Add items</Text>
            </TouchableOpacity>

            {pending.length > 0 ? (
              <TouchableOpacity
                style={[s.footBtn, { backgroundColor: '#EA580C' }]}
                onPress={() => fireMut.mutate(pending.map((l) => l.id))}
                disabled={fireMut.isPending}
              >
                {fireMut.isPending ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <Ionicons name="restaurant" size={18} color="#FFF" />
                    <Text style={s.footBtnText}>Send {pending.length}</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[s.footBtn, { backgroundColor: Colors.success }, lines.length === 0 && { opacity: 0.5 }]}
                onPress={() => billMut.mutate()}
                disabled={billMut.isPending || lines.length === 0}
              >
                {billMut.isPending ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <Ionicons name="receipt-outline" size={18} color="#FFF" />
                    <Text style={s.footBtnText}>Bill</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ── Menu picker ── */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <SafeAreaView edges={['top']} style={s.safe}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => { setPicking(false); setDraft({}); setSearch(''); }} style={s.backBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Add items</Text>
            <View style={{ width: 30 }} />
          </View>

          <View style={s.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search the menu"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>

          {menuQ.isLoading ? (
            <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
              {filteredMenu.map((m) => {
                const qty = draft[m.id] ?? 0;
                return (
                  <View key={m.id} style={s.menuRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.menuName}>{m.name}</Text>
                      <Text style={s.menuPrice}>{formatKES(m.retailPriceCents)}</Text>
                    </View>
                    <View style={s.stepper}>
                      <TouchableOpacity onPress={() => bump(m.id, -1)} style={s.stepBtn} disabled={qty === 0}>
                        <Ionicons name="remove" size={18} color={qty === 0 ? Colors.border : Colors.text} />
                      </TouchableOpacity>
                      <Text style={s.stepQty}>{qty}</Text>
                      <TouchableOpacity onPress={() => bump(m.id, 1)} style={s.stepBtn}>
                        <Ionicons name="add" size={18} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={s.footer}>
            <TouchableOpacity
              style={[s.footBtn, { flex: 1, backgroundColor: Colors.primary }, draftCount === 0 && { opacity: 0.5 }]}
              onPress={() => addMut.mutate()}
              disabled={draftCount === 0 || addMut.isPending}
            >
              {addMut.isPending ? <ActivityIndicator color="#FFF" size="small" /> : (
                <Text style={s.footBtnText}>
                  Add {draftCount} item{draftCount === 1 ? '' : 's'} to bill
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
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
  content: { padding: 16, gap: 12, paddingBottom: 30 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, gap: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  muted: { fontSize: 13, color: Colors.textSecondary },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  lineQty: { fontSize: 14, fontWeight: '800', color: Colors.primary, minWidth: 26 },
  lineName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  lineNote: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 1 },
  notFired: { fontSize: 11, color: Colors.warning, fontWeight: '600', marginTop: 2 },
  linePrice: { fontSize: 14, fontWeight: '600', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  totalValue: { fontSize: 19, fontWeight: '800', color: Colors.text },
  kotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  kotNumber: { fontSize: 13, color: Colors.text, fontWeight: '600' },
  servedBtn: { backgroundColor: Colors.success, paddingHorizontal: 12, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  servedText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  kotStatus: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  footer: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border },
  footBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 14, borderRadius: 12 },
  ghostBtn: { backgroundColor: Colors.primary + '14' },
  footBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 14, marginBottom: 0, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: Colors.card, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14 },
  menuName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  menuPrice: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  stepQty: { fontSize: 16, fontWeight: '800', color: Colors.text, minWidth: 22, textAlign: 'center' },
});
