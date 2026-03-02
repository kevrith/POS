import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { driverApi } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  driverId?: string;
  createdAt: string;
  deliveryFeeCents?: number;
  notes?: string;
}

export default function DeliveriesScreen() {
  const router = useRouter();
  const { user, businessId } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery<DeliveryOrder[]>({
    queryKey: ['deliveries', businessId],
    queryFn: () =>
      driverApi.get<DeliveryOrder[]>(
        `/delivery?businessId=${businessId}&status=ALL`
      ),
    refetchInterval: 30_000,
    select: (orders) =>
      orders.filter(
        (o) =>
          (o.status === 'ASSIGNED' || o.status === 'IN_TRANSIT') &&
          o.driverId === user?.id
      ),
  });

  const deliveries = data ?? [];

  function getStatusColor(status: string): string {
    return STATUS_COLORS[status] ?? Colors.textSecondary;
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case 'ASSIGNED': return 'person-circle-outline';
      case 'IN_TRANSIT': return 'bicycle';
      default: return 'ellipse-outline';
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>My Deliveries</Text>
          <Text style={styles.headerSub}>
            {deliveries.length} active{' '}
            {deliveries.length === 1 ? 'delivery' : 'deliveries'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading deliveries...</Text>
        </View>
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={Colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="bicycle-outline" size={64} color={Colors.border} />
              <Text style={styles.emptyTitle}>No active deliveries</Text>
              <Text style={styles.emptySubtitle}>
                You have no assigned or in-transit deliveries right now.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const statusColor = getStatusColor(item.status);
            return (
              <TouchableOpacity
                style={styles.orderCard}
                onPress={() => router.push(`/delivery/${item.id}` as any)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.orderNumberRow}>
                    <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
                    <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: statusColor + '20', borderColor: statusColor },
                    ]}
                  >
                    <Ionicons
                      name={getStatusIcon(item.status) as any}
                      size={12}
                      color={statusColor}
                    />
                    <Text style={[styles.statusText, { color: statusColor }]}>
                      {item.status === 'IN_TRANSIT' ? 'In Transit' : 'Assigned'}
                    </Text>
                  </View>
                </View>

                {item.customerName ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.infoText}>{item.customerName}</Text>
                  </View>
                ) : null}

                {item.deliveryAddress && item.deliveryAddress !== 'PICKUP' ? (
                  <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.infoText} numberOfLines={2}>
                      {item.deliveryAddress}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardFooter}>
                  <Text style={styles.dateText}>
                    {new Date(item.createdAt).toLocaleTimeString('en-KE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <View style={styles.viewRow}>
                    <Text style={styles.viewText}>View Details</Text>
                    <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  refreshBtn: { padding: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  listContent: { padding: 16, gap: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 64, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  cardHeader: {
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
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  infoText: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dateText: { fontSize: 12, color: Colors.textSecondary },
  viewRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});
