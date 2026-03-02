import {
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
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
  customerName?: string;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isWithinDays(date: Date, days: number): boolean {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return date >= cutoff;
}

export default function EarningsScreen() {
  const { user, businessId } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery<DeliveryOrder[]>({
    queryKey: ['earnings', businessId],
    queryFn: () =>
      driverApi.get<DeliveryOrder[]>(
        `/delivery?businessId=${businessId}&status=ALL`
      ),
    select: (orders) =>
      orders.filter(
        (o) => o.status === 'DELIVERED' && o.driverId === user?.id
      ),
  });

  const delivered = data ?? [];
  const today = new Date();

  const todayEarnings = delivered
    .filter((o) => isSameDay(new Date(o.createdAt), today))
    .reduce((sum, o) => sum + (o.deliveryFeeCents ?? 0), 0);

  const weeklyEarnings = delivered
    .filter((o) => isWithinDays(new Date(o.createdAt), 7))
    .reduce((sum, o) => sum + (o.deliveryFeeCents ?? 0), 0);

  const totalEarnings = delivered.reduce(
    (sum, o) => sum + (o.deliveryFeeCents ?? 0),
    0
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>My Earnings</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={delivered.slice().reverse()}
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
              {/* Stats Cards */}
              <View style={styles.statsRow}>
                <View style={[styles.statCard, styles.statCardToday]}>
                  <Ionicons name="today" size={24} color={Colors.primary} />
                  <Text style={styles.statValue}>{formatKES(todayEarnings)}</Text>
                  <Text style={styles.statLabel}>Today</Text>
                </View>
                <View style={[styles.statCard, styles.statCardWeek]}>
                  <Ionicons name="calendar" size={24} color={Colors.success} />
                  <Text style={styles.statValue}>{formatKES(weeklyEarnings)}</Text>
                  <Text style={styles.statLabel}>This Week</Text>
                </View>
              </View>

              <View style={styles.totalCard}>
                <View style={styles.totalLeft}>
                  <Ionicons name="wallet" size={28} color={Colors.primary} />
                  <View>
                    <Text style={styles.totalLabel}>Total Earnings</Text>
                    <Text style={styles.totalValue}>{formatKES(totalEarnings)}</Text>
                  </View>
                </View>
                <View style={styles.totalRight}>
                  <Text style={styles.deliveryCount}>{delivered.length}</Text>
                  <Text style={styles.deliveryCountLabel}>Deliveries</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Recent Deliveries</Text>
            </>
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="cash-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No delivered orders yet</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.earningRow}>
              <View style={styles.earningLeft}>
                <View style={styles.earningIcon}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                </View>
                <View>
                  <Text style={styles.earningOrder}>#{item.orderNumber}</Text>
                  {item.customerName ? (
                    <Text style={styles.earningCustomer}>{item.customerName}</Text>
                  ) : null}
                  <Text style={styles.earningDate}>
                    {new Date(item.createdAt).toLocaleDateString('en-KE', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
              <Text style={styles.earningFee}>
                {item.deliveryFeeCents
                  ? formatKES(item.deliveryFeeCents)
                  : '—'}
              </Text>
            </View>
          )}
        />
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 32 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  statCardToday: { borderTopWidth: 3, borderTopColor: Colors.primary },
  statCardWeek: { borderTopWidth: 3, borderTopColor: Colors.success },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textSecondary },
  totalCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  totalLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  totalLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  totalRight: { alignItems: 'center' },
  deliveryCount: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  deliveryCountLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 10,
  },
  emptyState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 15, color: Colors.textSecondary },
  earningRow: {
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
  },
  earningLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  earningIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  earningOrder: { fontSize: 14, fontWeight: '600', color: Colors.text },
  earningCustomer: { fontSize: 12, color: Colors.textSecondary },
  earningDate: { fontSize: 11, color: Colors.textSecondary },
  earningFee: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});
