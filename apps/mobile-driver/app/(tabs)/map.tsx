import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Linking,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { driverApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors, STATUS_COLORS } from '../../constants/theme';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  deliveryAddress?: string;
  lat?: number | null;
  lng?: number | null;
  driverId?: string;
  notes?: string;
  deliveryFeeCents?: number;
  createdAt: string;
}

function openGoogleMaps(address: string, lat?: number | null, lng?: number | null) {
  // Prefer GPS coordinates for precise navigation; fall back to address text
  const dest = lat && lng ? `${lat},${lng}` : encodeURIComponent(address);
  const googleUrl = `comgooglemaps://?daddr=${dest}&directionsmode=driving`;
  const mapsUrl = lat && lng
    ? `https://maps.google.com/?q=${lat},${lng}&travelmode=driving`
    : `https://maps.google.com/?q=${encodeURIComponent(address)}&travelmode=driving`;

  Linking.canOpenURL(googleUrl)
    .then((supported) => Linking.openURL(supported ? googleUrl : mapsUrl))
    .catch(() => Linking.openURL(mapsUrl).catch(() =>
      Alert.alert('Error', 'Could not open maps application.')
    ));
}

function callPhone(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() =>
    Alert.alert('Error', 'Could not open the phone dialler.')
  );
}

function openWaze(address: string, lat?: number | null, lng?: number | null) {
  const wazeUrl = lat && lng
    ? `waze://?ll=${lat},${lng}&navigate=yes`
    : `waze://?q=${encodeURIComponent(address)}&navigate=yes`;
  Linking.canOpenURL(wazeUrl)
    .then((supported) => {
      if (supported) return Linking.openURL(wazeUrl);
      Alert.alert('Waze not installed', 'Please use Google Maps instead.');
    })
    .catch(() => Alert.alert('Error', 'Could not open Waze.'));
}

function DeliveryCard({ item, stopNumber, totalStops }: { item: DeliveryOrder; stopNumber: number; totalStops: number }) {
  const router = useRouter();
  const address = item.address ?? item.deliveryAddress ?? '';
  const statusColor = STATUS_COLORS[item.status] ?? Colors.textSecondary;

  return (
    <View style={styles.card}>
      {/* Order Header */}
      <View style={styles.cardHeader}>
        <View style={styles.orderRef}>
          <View style={styles.stopBadge}>
            <Text style={styles.stopBadgeText}>{stopNumber}/{totalStops}</Text>
          </View>
          <Ionicons name="receipt-outline" size={16} color={Colors.primary} />
          <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {item.status === 'IN_TRANSIT' ? 'In Transit' : 'Assigned'}
          </Text>
        </View>
      </View>

      {/* Customer */}
      {item.customerName && (
        <View style={styles.infoRow}>
          <Ionicons name="person" size={16} color={Colors.textSecondary} />
          <Text style={styles.infoText}>{item.customerName}</Text>
        </View>
      )}

      {/* Address Section */}
      {address && address !== 'PICKUP' ? (
        <View style={styles.addressSection}>
          <View style={styles.addressHeader}>
            <Ionicons name="location" size={16} color={Colors.error} />
            <Text style={styles.addressLabel}>Delivery Address</Text>
          </View>
          <Text style={styles.addressText}>{address}</Text>

          {/* Map buttons */}
          <View style={styles.mapBtns}>
            <TouchableOpacity
              style={[styles.mapBtn, { backgroundColor: Colors.primary }]}
              onPress={() => openGoogleMaps(address, item.lat, item.lng)}
              activeOpacity={0.85}
            >
              <Ionicons name="map" size={16} color="#FFFFFF" />
              <Text style={styles.mapBtnText}>Google Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.mapBtn, { backgroundColor: '#00B2FF' }]}
              onPress={() => openWaze(address, item.lat, item.lng)}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate" size={16} color="#FFFFFF" />
              <Text style={styles.mapBtnText}>Waze</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.pickupBadge}>
          <Ionicons name="bag-check" size={16} color={Colors.success} />
          <Text style={styles.pickupText}>Pickup / No delivery address</Text>
        </View>
      )}

      {/* Phone */}
      {item.customerPhone && (
        <TouchableOpacity
          style={styles.callBtn}
          onPress={() => callPhone(item.customerPhone!)}
          activeOpacity={0.85}
        >
          <Ionicons name="call" size={18} color="#FFFFFF" />
          <Text style={styles.callBtnText}>Call Customer: {item.customerPhone}</Text>
        </TouchableOpacity>
      )}

      {/* Notes */}
      {item.notes && (
        <View style={styles.notesBox}>
          <Ionicons name="chatbox-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      )}

      {/* Delivery Fee */}
      {item.deliveryFeeCents ? (
        <View style={styles.feeRow}>
          <Ionicons name="cash-outline" size={14} color={Colors.success} />
          <Text style={styles.feeText}>Fee: {formatKES(item.deliveryFeeCents)}</Text>
        </View>
      ) : null}

      {/* View Full Details */}
      <TouchableOpacity
        style={styles.detailsLink}
        onPress={() => router.push(`/delivery/${item.id}` as any)}
      >
        <Text style={styles.detailsLinkText}>View Full Details</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

export default function MapScreen() {
  const { user, businessId } = useAuthStore();

  const { data, isLoading, refetch, isRefetching } = useQuery<DeliveryOrder[]>({
    queryKey: ['map-deliveries', businessId],
    queryFn: () =>
      driverApi.get<DeliveryOrder[]>(
        `/delivery?businessId=${businessId}&status=ALL`
      ),
    refetchInterval: 15_000, // Poll every 15 seconds
    select: (orders) =>
      orders.filter(
        (o) =>
          (o.status === 'ASSIGNED' || o.status === 'IN_TRANSIT') &&
          o.driverId === user?.id
      ),
  });

  const deliveries = data ?? [];

  if (isLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Delivery Map</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading deliveries...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerBar}>
        <View>
          <Text style={styles.headerTitle}>Delivery Map</Text>
          <Text style={styles.headerSub}>
            {deliveries.length} active {deliveries.length === 1 ? 'stop' : 'stops'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

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
            <Ionicons name="map-outline" size={64} color={Colors.border} />
            <Text style={styles.emptyTitle}>No Active Deliveries</Text>
            <Text style={styles.emptySubtitle}>
              You have no assigned deliveries. Addresses and navigation will appear here.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => <DeliveryCard item={item} stopNumber={index + 1} totalStops={deliveries.length} />}
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
  loadingText: { fontSize: 14, color: Colors.textSecondary },
  listContent: { padding: 16, gap: 14, paddingBottom: 32 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
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
  orderRef: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  orderNumber: { fontSize: 16, fontWeight: '700', color: Colors.text },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { fontSize: 14, color: Colors.text },
  addressSection: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  addressText: { fontSize: 15, color: Colors.text, fontWeight: '500', lineHeight: 22 },
  mapBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  mapBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    gap: 6,
  },
  mapBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  pickupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.success + '10',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  pickupText: { fontSize: 13, color: Colors.success, fontWeight: '500' },
  callBtn: {
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  callBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 10,
  },
  notesText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feeText: { fontSize: 14, color: Colors.success, fontWeight: '600' },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailsLinkText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  stopBadge: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 },
  stopBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
});
