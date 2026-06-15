import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { useActiveStoreOverride } from '../../stores/activeStore';
import { canManageBusiness } from '../../lib/roles';
import { Colors } from '../../constants/theme';

interface SalesReportResp {
  summary: { totalRevenueCents: number; totalSales?: number };
}
interface LowStockItem { id: string }
interface ExpiringRow { id?: string }

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

interface NavCard {
  key: string;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  route: string;
  ownerOnly?: boolean;
}

const NAV_CARDS: NavCard[] = [
  { key: 'stock', title: 'Stock', desc: 'View levels, receive & adjust', icon: 'cube-outline', color: Colors.primary, route: '/manage-stock' },
  { key: 'stocktake', title: 'Stock Take', desc: 'Count shelves & reconcile', icon: 'clipboard-outline', color: Colors.indigo, route: '/manage-stocktake' },
  { key: 'batches', title: 'Batches & Expiry', desc: 'Track and write off expiry', icon: 'time-outline', color: Colors.warning, route: '/manage-batches' },
  { key: 'transfers', title: 'Stock Transfers', desc: 'Move stock between stores', icon: 'swap-horizontal-outline', color: Colors.success, route: '/manage-transfers' },
  { key: 'users', title: 'Staff', desc: 'Add & manage team members', icon: 'people-outline', color: '#0EA5E9', route: '/manage-users', ownerOnly: true },
  { key: 'settings', title: 'Business Settings', desc: 'Receipt, tax & store config', icon: 'options-outline', color: '#8B5CF6', route: '/manage-settings', ownerOnly: true },
];

export default function ManageScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const { businessId, storeId, stores } = useActiveStore();
  const setOverride = useActiveStoreOverride((s) => s.setOverride);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const { startDate, endDate } = todayRange();

  const activeStoreName = stores.find((s) => s.id === storeId)?.name ?? 'Store';

  const salesQ = useQuery<SalesReportResp>({
    queryKey: ['manage-sales-today', businessId, storeId],
    queryFn: () =>
      mobileApi.get<SalesReportResp>(
        `/reports/sales?businessId=${businessId}&storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`
      ),
    enabled: !!businessId && !!storeId,
    staleTime: 60_000,
  });

  const lowStockQ = useQuery<LowStockItem[]>({
    queryKey: ['manage-low-stock', businessId, storeId],
    queryFn: () => mobileApi.get<LowStockItem[]>(`/items/low-stock?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 60_000,
  });

  const expiringQ = useQuery<ExpiringRow[]>({
    queryKey: ['manage-expiring', businessId, storeId],
    queryFn: () => mobileApi.get<ExpiringRow[]>(`/items/expiring?businessId=${businessId}&storeId=${storeId}&days=30`),
    enabled: !!businessId && !!storeId,
    staleTime: 60_000,
  });

  const refreshing = salesQ.isRefetching || lowStockQ.isRefetching || expiringQ.isRefetching;
  function refetchAll() {
    salesQ.refetch();
    lowStockQ.refetch();
    expiringQ.refetch();
  }

  const todayRevenue = salesQ.data?.summary?.totalRevenueCents ?? 0;
  const lowStockCount = lowStockQ.data?.length ?? 0;
  const expiringCount = expiringQ.data?.length ?? 0;

  const cards = NAV_CARDS.filter((c) => !c.ownerOnly || canManageBusiness(role));

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manage</Text>
        <Text style={styles.headerSub}>Run your business from the floor</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} colors={[Colors.primary]} />}
      >
        {/* Store switcher (only when more than one store) */}
        {stores.length > 1 && (
          <TouchableOpacity style={styles.storeBanner} onPress={() => setShowStorePicker(true)} activeOpacity={0.8}>
            <Ionicons name="storefront-outline" size={18} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.storeBannerLabel}>Active store</Text>
              <Text style={styles.storeBannerValue}>{activeStoreName}</Text>
            </View>
            <Ionicons name="swap-horizontal" size={18} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Dashboard glance */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="cash-outline" size={20} color={Colors.success} />
            <Text style={styles.statValue}>{formatKES(todayRevenue)}</Text>
            <Text style={styles.statLabel}>Sales Today</Text>
          </View>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/manage-stock?filter=low')}
            activeOpacity={0.8}
          >
            <Ionicons name="alert-circle-outline" size={20} color={lowStockCount > 0 ? Colors.warning : Colors.textSecondary} />
            <Text style={[styles.statValue, lowStockCount > 0 && { color: Colors.warning }]}>{lowStockCount}</Text>
            <Text style={styles.statLabel}>Low Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statCard}
            onPress={() => router.push('/manage-batches')}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={20} color={expiringCount > 0 ? Colors.error : Colors.textSecondary} />
            <Text style={[styles.statValue, expiringCount > 0 && { color: Colors.error }]}>{expiringCount}</Text>
            <Text style={styles.statLabel}>Expiring</Text>
          </TouchableOpacity>
        </View>

        {/* Navigation cards */}
        <Text style={styles.sectionTitle}>Tools</Text>
        <View style={styles.cardGrid}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.key}
              style={styles.navCard}
              onPress={() => router.push(card.route as any)}
              activeOpacity={0.85}
            >
              <View style={[styles.navIcon, { backgroundColor: card.color + '18' }]}>
                <Ionicons name={card.icon} size={22} color={card.color} />
              </View>
              <Text style={styles.navTitle}>{card.title}</Text>
              <Text style={styles.navDesc}>{card.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Modal visible={showStorePicker} animationType="slide" transparent onRequestClose={() => setShowStorePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Switch Store</Text>
              <TouchableOpacity onPress={() => setShowStorePicker(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            {stores.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.storeOption}
                onPress={() => { setOverride(s.id); setShowStorePicker(false); }}
              >
                <Ionicons
                  name={s.id === storeId ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={s.id === storeId ? Colors.primary : Colors.textSecondary}
                />
                <Text style={styles.storeOptionText}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  storeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.primary + '12',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  storeBannerLabel: { fontSize: 11, color: Colors.textSecondary },
  storeBannerValue: { fontSize: 14, fontWeight: '700', color: Colors.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  storeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  storeOptionText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 4,
  },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  navCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  navIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  navTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  navDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 16 },
});
