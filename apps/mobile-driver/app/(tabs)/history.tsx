import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { driverApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors } from '../../constants/theme';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  driverId?: string;
  deliveryFeeCents?: number;
  createdAt: string;
  deliveredAt?: string | null;
  customerName?: string;
  address?: string;
  deliveryAddress?: string;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWithinDays(date: Date, days: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

export default function HistoryScreen() {
  const { user, businessId } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery<DeliveryOrder[]>({
    queryKey: ['history', businessId, user?.id],
    queryFn: () =>
      driverApi.get<DeliveryOrder[]>(
        `/delivery?businessId=${businessId}&status=ALL`
      ),
    select: (orders) =>
      orders
        .filter(
          (o) =>
            (o.status === 'DELIVERED' || o.status === 'CANCELLED') &&
            o.driverId === user?.id
        )
        .sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    refetchInterval: 60_000,
  });

  const completed = data ?? [];
  const today = new Date();

  const todayCount = completed.filter(
    (o) => o.status === 'DELIVERED' && isSameDay(new Date(o.createdAt), today)
  ).length;

  const weekCount = completed.filter(
    (o) => o.status === 'DELIVERED' && isWithinDays(new Date(o.createdAt), 7)
  ).length;

  const totalDelivered = completed.filter((o) => o.status === 'DELIVERED').length;
  const totalCancelled = completed.filter((o) => o.status === 'CANCELLED').length;

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Delivery History</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Delivery History</Text>
      </View>

      <FlatList
        data={completed}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Summary Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderTopColor: Colors.primary }]}>
                <Ionicons name="today" size={22} color={Colors.primary} />
                <Text style={styles.statValue}>{todayCount}</Text>
                <Text style={styles.statLabel}>Today</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: Colors.success }]}>
                <Ionicons name="calendar" size={22} color={Colors.success} />
                <Text style={styles.statValue}>{weekCount}</Text>
                <Text style={styles.statLabel}>This Week</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: Colors.warning }]}>
                <Ionicons name="checkmark-done" size={22} color={Colors.warning} />
                <Text style={styles.statValue}>{totalDelivered}</Text>
                <Text style={styles.statLabel}>All Time</Text>
              </View>
            </View>

            {/* Cancelled count */}
            {totalCancelled > 0 && (
              <View style={styles.cancelledRow}>
                <Ionicons name="close-circle-outline" size={16} color={Colors.error} />
                <Text style={styles.cancelledText}>
                  {totalCancelled} cancelled {totalCancelled === 1 ? 'delivery' : 'deliveries'} (not counted)
                </Text>
              </View>
            )}

            {completed.length > 0 && (
              <Text style={styles.sectionTitle}>All Deliveries</Text>
            )}
          </>
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={56} color={Colors.border} />
            <Text style={styles.emptyTitle}>No completed deliveries</Text>
            <Text style={styles.emptySubtitle}>
              Your delivery history will appear here once you complete your first delivery.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isDelivered = item.status === 'DELIVERED';
          const address = item.address ?? item.deliveryAddress ?? '';
          const deliveryDate = item.deliveredAt ?? item.createdAt;

          return (
            <View style={[styles.historyCard, !isDelivered && styles.historyCardCancelled]}>
              <View style={styles.historyLeft}>
                <View
                  style={[
                    styles.statusIcon,
                    { backgroundColor: isDelivered ? Colors.success + '15' : Colors.error + '15' },
                  ]}
                >
                  <Ionicons
                    name={isDelivered ? 'checkmark-circle' : 'close-circle'}
                    size={22}
                    color={isDelivered ? Colors.success : Colors.error}
                  />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyOrderNum}>#{item.orderNumber}</Text>
                  {item.customerName && (
                    <Text style={styles.historyCustomer} numberOfLines={1}>
                      {item.customerName}
                    </Text>
                  )}
                  {address && address !== 'PICKUP' && (
                    <Text style={styles.historyAddress} numberOfLines={1}>
                      {address}
                    </Text>
                  )}
                  <View style={styles.historyDateRow}>
                    <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
                    <Text style={styles.historyDate}>
                      {new Date(deliveryDate).toLocaleDateString('en-KE', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.historyRight}>
                {isDelivered && item.deliveryFeeCents ? (
                  <Text style={styles.historyFee}>
                    {formatKES(item.deliveryFeeCents)}
                  </Text>
                ) : (
                  <Text style={[styles.historyStatus, { color: isDelivered ? Colors.success : Colors.error }]}>
                    {isDelivered ? 'Delivered' : 'Cancelled'}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 5,
    borderTopWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.error + '10',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  cancelledText: { fontSize: 13, color: Colors.error },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  historyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success,
  },
  historyCardCancelled: {
    borderLeftColor: Colors.error,
    opacity: 0.8,
  },
  historyLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  statusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  historyInfo: { flex: 1 },
  historyOrderNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  historyCustomer: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  historyAddress: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  historyDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  historyDate: { fontSize: 12, color: Colors.textSecondary },
  historyRight: { alignItems: 'flex-end', paddingLeft: 8 },
  historyFee: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  historyStatus: { fontSize: 12, fontWeight: '600' },
});
