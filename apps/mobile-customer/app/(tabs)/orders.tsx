import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiGet, formatKES } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { useCartStore } from '../../stores/cart';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface UnifiedItem { itemId?: string; name: string; quantity: number; unitPriceCents: number; totalCents: number }
interface UnifiedOrder {
  id: string;
  orderNumber: string;
  channel: 'ONLINE' | 'AGENT';
  status: string;
  paymentStatus: string;
  fulfillmentType: string;
  deliveryAddress?: string | null;
  etaMinutes?: number | null;
  totalCents: number;
  invoiceNumber?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  items: UnifiedItem[];
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending', CONFIRMED: 'Confirmed', READY: 'Ready', ASSIGNED: 'Driver assigned',
    IN_TRANSIT: 'On the way', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', REJECTED: 'Rejected',
    SUBMITTED: 'Submitted', PACKED: 'Packed', DISPATCHED: 'Dispatched', INVOICED: 'Invoiced', DRAFT: 'Draft',
  };
  return map[s] ?? s;
}

export default function OrdersScreen() {
  const router = useRouter();
  const customerName = useSessionStore((s) => s.customerName);
  const { addItem, updateQty, clearCart } = useCartStore();

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<UnifiedOrder[]>({
    queryKey: ['my-orders'],
    queryFn: () => apiGet<UnifiedOrder[]>('/portal/me/orders'),
    refetchInterval: 15_000,
  });

  function reorder(order: UnifiedOrder) {
    const lines = order.items.filter((i) => i.itemId);
    if (lines.length === 0) { Alert.alert('Cannot reorder', 'These items are no longer available.'); return; }
    clearCart();
    for (const i of lines) {
      addItem({ id: i.itemId!, name: i.name, retailPriceCents: i.unitPriceCents });
      if (i.quantity > 1) updateQty(i.itemId!, i.quantity);
    }
    Alert.alert('Added to cart', `${lines.length} item(s) added.`, [
      { text: 'Keep browsing', style: 'cancel' },
      { text: 'View cart', onPress: () => router.push('/(tabs)/cart') },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <Text style={s.headerTitle}>My Orders</Text>
        {customerName ? <Text style={s.headerSub}>{customerName}</Text> : null}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="cube-outline" size={56} color={Colors.border} />
              <Text style={s.emptyTitle}>No orders yet</Text>
              <Text style={s.emptySub}>Your orders will appear here once you place one.</Text>
            </View>
          }
          renderItem={({ item: o }) => {
            const color = STATUS_COLORS[o.status] ?? Colors.textSecondary;
            return (
              <View style={s.card}>
                <View style={s.cardTop}>
                  <View style={s.rowGap}>
                    <Ionicons name="receipt" size={15} color={Colors.primary} />
                    <Text style={s.orderNum}>{o.orderNumber}</Text>
                    <View style={[s.chBadge, o.channel === 'AGENT' ? s.chAgent : s.chOnline]}>
                      <Text style={[s.chText, o.channel === 'AGENT' ? { color: '#92400E' } : { color: '#3730A3' }]}>
                        {o.channel === 'AGENT' ? 'Agent' : 'Online'}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: color + '20', borderColor: color }]}>
                    <Text style={[s.statusText, { color }]}>{statusLabel(o.status)}</Text>
                  </View>
                </View>

                <View style={s.items}>
                  {o.items.map((it, idx) => (
                    <View key={idx} style={s.itemRow}>
                      <Text style={s.itemName} numberOfLines={1}>{it.quantity}× {it.name}</Text>
                      <Text style={s.itemTotal}>{formatKES(it.totalCents)}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.cardBottom}>
                  <View style={s.rowGap}>
                    <Text style={s.total}>{formatKES(o.totalCents)}</Text>
                    <View style={[s.payBadge, o.paymentStatus === 'PAID' ? s.paid : s.unpaid]}>
                      <Text style={[s.payText, o.paymentStatus === 'PAID' ? { color: '#166534' } : { color: '#991B1B' }]}>{o.paymentStatus}</Text>
                    </View>
                    {o.etaMinutes ? <Text style={s.eta}>ETA {o.etaMinutes}m</Text> : null}
                  </View>
                  {o.items.some((i) => i.itemId) ? (
                    <TouchableOpacity style={s.reorderBtn} onPress={() => reorder(o)}>
                      <Ionicons name="repeat" size={14} color={Colors.primary} />
                      <Text style={s.reorderText}>Reorder</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {o.invoiceNumber ? (
                  <Text style={s.invoice}><Ionicons name="document-text-outline" size={12} color={Colors.textSecondary} /> Invoice {o.invoiceNumber}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.card, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  list: { padding: 14, gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
  card: { backgroundColor: Colors.card, borderRadius: 12, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  chBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  chOnline: { backgroundColor: '#E0E7FF' },
  chAgent: { backgroundColor: '#FEF3C7' },
  chText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '600' },
  items: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, gap: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between' },
  itemName: { flex: 1, fontSize: 13, color: Colors.text, marginRight: 8 },
  itemTotal: { fontSize: 13, color: Colors.textSecondary },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 },
  total: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  payBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  paid: { backgroundColor: '#DCFCE7' },
  unpaid: { backgroundColor: '#FEE2E2' },
  payText: { fontSize: 10, fontWeight: '700' },
  eta: { fontSize: 11, color: Colors.textSecondary },
  reorderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: Colors.primary },
  reorderText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  invoice: { fontSize: 11, color: Colors.textSecondary },
});
