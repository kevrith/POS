import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { apiGet } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { useCartStore } from '../../stores/cart';
import { parseOrderItems, matchOrderToMenu, MenuItemLite } from '../../lib/reorder';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface PortalMenuResp {
  categories: Array<{ items: MenuItemLite[] }>;
}

// Shape from GET /portal/orders (portal service getOrderHistory)
interface PortalOrder {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress?: string;
  notes?: string;
  deliveryFeeCents?: number;
  createdAt: string;
  deliveredAt?: string | null;
}

const POLL_INTERVAL_MS = 10_000; // 10 seconds

export default function OrdersScreen() {
  const router = useRouter();
  const businessId = useSessionStore((s) => s.businessId);
  const { addItem, updateQty, clearCart } = useCartStore();
  const [reordering, setReordering] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [searched, setSearched] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function startPolling(phoneVal: string) {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      if (!phoneVal.trim()) return;
      try {
        const data = await apiGet<PortalOrder[]>(
          `/portal/orders?phone=${encodeURIComponent(phoneVal.trim())}&businessId=${businessId}`
        );
        setOrders(Array.isArray(data) ? data : []);
      } catch {
        // Silent refresh failure — don't alert on background poll
      }
    }, POLL_INTERVAL_MS);
  }

  // Stop polling when unmounted
  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function fetchOrders(isRefresh = false) {
    if (!phone.trim()) {
      Alert.alert('Phone Required', 'Please enter your phone number to view orders.');
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await apiGet<PortalOrder[]>(
        `/portal/orders?phone=${encodeURIComponent(phone.trim())}&businessId=${businessId}`
      );
      setOrders(Array.isArray(data) ? data : []);
      setSearched(true);
      startPolling(phone);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not load orders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    if (searched) fetchOrders(true);
  }, [searched, phone]);

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'PENDING': return 'time-outline';
      case 'ASSIGNED': return 'person-outline';
      case 'IN_TRANSIT': return 'bicycle-outline';
      case 'DELIVERED': return 'checkmark-circle-outline';
      case 'CANCELLED': return 'close-circle-outline';
      default: return 'ellipse-outline';
    }
  }

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Pending',
      ASSIGNED: 'Driver Assigned',
      IN_TRANSIT: 'On the Way',
      DELIVERED: 'Delivered',
      CANCELLED: 'Cancelled',
    };
    return labels[status] ?? status;
  }

  async function handleReorder(order: PortalOrder) {
    setReordering(order.id);
    try {
      const lines = parseOrderItems(order.notes);
      if (lines.length === 0) {
        Alert.alert('Cannot reorder', 'This order has no items we can re-add.');
        return;
      }
      const menu = await apiGet<PortalMenuResp>(`/portal/menu?businessId=${businessId}`);
      const flat = (menu.categories ?? []).flatMap((c) => c.items);
      const { matched, missing } = matchOrderToMenu(lines, flat);
      if (matched.length === 0) {
        Alert.alert('Unavailable', 'None of these items are on the menu right now.');
        return;
      }
      clearCart();
      for (const m of matched) {
        addItem({ id: m.id, name: m.name, retailPriceCents: m.retailPriceCents });
        if (m.quantity > 1) updateQty(m.id, m.quantity);
      }
      const note = missing.length ? `\n\nUnavailable now: ${missing.join(', ')}` : '';
      Alert.alert('Added to cart', `${matched.length} item(s) added.${note}`, [
        { text: 'Keep browsing', style: 'cancel' },
        { text: 'View cart', onPress: () => router.push('/(tabs)/cart') },
      ]);
    } catch (e: any) {
      Alert.alert('Reorder failed', e?.message ?? 'Could not reorder.');
    } finally {
      setReordering(null);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>My Orders</Text>
        {searched && (
          <View style={styles.pollIndicator}>
            <Ionicons name="sync" size={14} color={Colors.success} />
            <Text style={styles.pollText}>Live</Text>
          </View>
        )}
      </View>

      <View style={styles.searchSection}>
        <Text style={styles.searchLabel}>Track your orders</Text>
        <View style={styles.inputRow}>
          <View style={styles.prefixBox}>
            <Text style={styles.prefixText}>+254</Text>
          </View>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              // If user changes phone, stop polling until they search again
              if (searched) {
                stopPolling();
                setSearched(false);
                setOrders([]);
              }
            }}
            placeholder="7XX XXX XXX"
            keyboardType="phone-pad"
            maxLength={12}
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="search"
            onSubmitEditing={() => fetchOrders(false)}
          />
        </View>
        <TouchableOpacity
          style={[styles.searchBtn, loading && { opacity: 0.7 }]}
          onPress={() => fetchOrders(false)}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={styles.searchBtnText}>View Orders</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {searched ? (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={56} color={Colors.border} />
              <Text style={styles.emptyTitle}>No orders found</Text>
              <Text style={styles.emptySubtitle}>
                We could not find any orders for this phone number.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusColor = STATUS_COLORS[item.status] ?? Colors.textSecondary;
            const isDelivery = item.deliveryAddress && item.deliveryAddress !== 'PICKUP';
            return (
              <View style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.orderNumberRow}>
                    <Ionicons name="receipt" size={16} color={Colors.primary} />
                    <Text style={styles.orderNumber}>
                      Order #{item.orderNumber}
                    </Text>
                  </View>
                  <View
                    style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}
                  >
                    <Ionicons
                      name={getStatusIcon(item.status) as any}
                      size={12}
                      color={statusColor}
                    />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {getStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>

                {/* Order Type */}
                <View style={styles.typeRow}>
                  <Ionicons
                    name={isDelivery ? 'bicycle-outline' : 'bag-check-outline'}
                    size={14}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.typeText}>
                    {isDelivery ? 'Delivery' : 'Pickup'}
                  </Text>
                </View>

                {isDelivery && item.deliveryAddress && (
                  <View style={styles.addressRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.addressText} numberOfLines={1}>
                      {item.deliveryAddress}
                    </Text>
                  </View>
                )}

                <View style={styles.orderFooter}>
                  <View style={styles.dateRow}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                    <Text style={styles.dateText}>
                      {new Date(item.createdAt).toLocaleDateString('en-KE', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  {item.deliveredAt && (
                    <View style={styles.dateRow}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={Colors.success} />
                      <Text style={[styles.dateText, { color: Colors.success }]}>Delivered</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.reorderBtn}
                  onPress={() => handleReorder(item)}
                  disabled={reordering === item.id}
                >
                  {reordering === item.id ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="repeat" size={15} color={Colors.primary} />
                      <Text style={styles.reorderText}>Reorder</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      ) : (
        <View style={styles.promptState}>
          <Ionicons name="cube-outline" size={56} color={Colors.border} />
          <Text style={styles.promptTitle}>Track Your Orders</Text>
          <Text style={styles.promptText}>
            Enter your phone number above to view your order history and live tracking.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  pollIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  pollText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  searchSection: {
    backgroundColor: Colors.card,
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 8 },
  prefixBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  prefixText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  listContent: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  promptState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  promptTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  promptText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderNumber: { fontSize: 15, fontWeight: '700', color: Colors.text },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typeText: { fontSize: 13, color: Colors.textSecondary },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressText: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reorderBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  reorderText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { fontSize: 12, color: Colors.textSecondary },
});
