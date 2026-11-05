import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { apiGet, formatKES } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { useCartStore } from '../../stores/cart';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface TrackData {
  status: string;
  driverLocations: Array<{ lat: number; lng: number; timestamp: string }>;
}

/** A position stops being "live" once the driver's app has been quiet this long. */
const LIVE_WITHIN_MS = 2 * 60 * 1000;

/** "just now" / "6m ago" / "3h ago" / "yesterday" — a bare clock time tells a customer
 *  nothing about whether the driver is actually moving. */
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Driver-location map (OpenStreetMap embed — no API key). */
function TrackDriverModal({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<TrackData>({
    queryKey: ['track', orderNumber],
    queryFn: () => apiGet<TrackData>(`/delivery/orders/${encodeURIComponent(orderNumber)}/track`),
    refetchInterval: 15_000,
  });
  const loc = data?.driverLocations?.[0];
  const isLive = !!loc && Date.now() - new Date(loc.timestamp).getTime() <= LIVE_WITHIN_MS;
  const d = 0.006;
  const html = loc
    ? `<html><body style="margin:0"><iframe width="100%" height="100%" frameborder="0" style="border:0"
        src="https://www.openstreetmap.org/export/embed.html?bbox=${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d}&layer=mapnik&marker=${loc.lat},${loc.lng}"></iframe></body></html>`
    : '';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>Track driver · {orderNumber}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
        </View>
        {isLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : loc ? (
          <>
            <WebView source={{ html }} style={{ flex: 1 }} />
            <View style={s.trackFoot}>
              {/* The driver app only reports while it is open, so this fix can be hours
                  old. Calling that "Live" sends a customer to wait at the gate. */}
              <View style={[s.liveDot, !isLive && s.staleDot]} />
              <Text style={s.trackFootText}>
                {isLive
                  ? `Live · updated ${new Date(loc.timestamp).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}`
                  : `Last seen ${timeAgo(loc.timestamp)} — the driver's app is not reporting right now`}
              </Text>
            </View>
          </>
        ) : (
          <View style={s.center}>
            <Ionicons name="location-outline" size={48} color={Colors.border} />
            <Text style={s.emptySub}>The driver hasn't shared their location yet. Check back shortly.</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

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
  const [trackingOrder, setTrackingOrder] = useState<string | null>(null);

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
                  <View style={s.rowGap}>
                    {o.channel === 'ONLINE' && ['ASSIGNED', 'IN_TRANSIT'].includes(o.status) ? (
                      <TouchableOpacity style={s.trackBtn} onPress={() => setTrackingOrder(o.orderNumber)}>
                        <Ionicons name="navigate" size={14} color="#FFFFFF" />
                        <Text style={s.trackBtnText}>Track</Text>
                      </TouchableOpacity>
                    ) : null}
                    {o.items.some((i) => i.itemId) ? (
                      <TouchableOpacity style={s.reorderBtn} onPress={() => reorder(o)}>
                        <Ionicons name="repeat" size={14} color={Colors.primary} />
                        <Text style={s.reorderText}>Reorder</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {o.invoiceNumber ? (
                  <Text style={s.invoice}><Ionicons name="document-text-outline" size={12} color={Colors.textSecondary} /> Invoice {o.invoiceNumber}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
      {trackingOrder ? <TrackDriverModal orderNumber={trackingOrder} onClose={() => setTrackingOrder(null)} /> : null}
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
  trackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: Colors.primary },
  trackBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  trackFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  staleDot: { backgroundColor: '#9CA3AF' },
  trackFootText: { fontSize: 13, color: Colors.textSecondary },
  reorderText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  invoice: { fontSize: 11, color: Colors.textSecondary },
});
