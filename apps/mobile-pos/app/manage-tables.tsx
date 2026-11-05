import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { offlineId } from '../lib/manage-helpers';
import {
  sortFloor, summariseFloor, normalizeTableStatus, tableAction,
  TABLE_STATUS_LABELS, type FloorTable, type TableStatus,
} from '../lib/hospitality';
import { Colors } from '../constants/theme';

const STATUS_COLOR: Record<TableStatus, string> = {
  AVAILABLE: Colors.success,
  OCCUPIED: Colors.primary,
  BILL_REQUESTED: Colors.warning,
  RESERVED: Colors.indigo,
};

/**
 * The restaurant floor: which tables are free, which are seated, which have food
 * ready to run and which have asked for the bill.
 *
 * Tapping a free table opens an order and drops the waiter straight into it —
 * that "which table?" step is the only thing dine-in really adds ahead of the
 * normal cart, which is why mobile keeps one POS screen instead of copying the
 * web app's separate HospitalityPage.
 */
export default function TablesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { businessId, storeId } = useActiveStore();

  const tablesQ = useQuery<FloorTable[]>({
    queryKey: ['tables', storeId],
    queryFn: () => mobileApi.get<FloorTable[]>(`/hospitality/tables?storeId=${storeId}`),
    enabled: !!storeId,
    // A floor changes constantly and several waiters share it, so poll rather
    // than trusting a cached view of who is seated.
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const openMut = useMutation({
    mutationFn: (table: FloorTable) =>
      mobileApi.post<{ id: string }>('/hospitality/orders', {
        offlineId: offlineId(),
        businessId,
        storeId,
        tableId: table.id,
        waiterId: user?.id ?? '',
      }),
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      router.push(`/table-order?orderId=${order.id}` as any);
    },
    onError: (e: any) => Alert.alert('Could not open the table', e?.message ?? 'Please try again.'),
  });

  const tables = useMemo(() => sortFloor(tablesQ.data ?? []), [tablesQ.data]);
  const summary = useMemo(() => summariseFloor(tablesQ.data ?? []), [tablesQ.data]);

  function onTablePress(t: FloorTable) {
    if (tableAction(t) === 'open') {
      router.push(`/table-order?orderId=${t.currentOrderId}` as any);
    } else {
      openMut.mutate(t);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Tables</Text>
        <TouchableOpacity onPress={() => router.push('/manage-kitchen' as any)} style={s.backBtn}>
          <Ionicons name="restaurant-outline" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {tablesQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={tablesQ.isRefetching} onRefresh={() => void tablesQ.refetch()} colors={[Colors.primary]} />}
        >
          <View style={s.statsRow}>
            <Stat label="Free" value={summary.free} color={Colors.success} />
            <Stat label="Seated" value={summary.seated} color={Colors.primary} />
            <Stat label="Bill asked" value={summary.billRequested} color={Colors.warning} />
            <Stat label="Food ready" value={summary.foodReady} color={Colors.error} />
          </View>

          {tables.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>
                No tables set up for this store yet. Add them from the web app under Hospitality.
              </Text>
            </View>
          ) : (
            <View style={s.grid}>
              {tables.map((t) => {
                const st = normalizeTableStatus(t.status);
                const color = STATUS_COLOR[st];
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[s.tile, { borderColor: color }]}
                    onPress={() => onTablePress(t)}
                    activeOpacity={0.85}
                    disabled={openMut.isPending}
                  >
                    {t.hasReadyKOT && (
                      <View style={s.readyDot}>
                        <Ionicons name="notifications" size={11} color="#FFF" />
                      </View>
                    )}
                    <Text style={s.tileNumber}>{t.number}</Text>
                    <Text style={s.tileSeats}>{t.capacity} seats</Text>
                    <View style={[s.tileStatus, { backgroundColor: color + '1A' }]}>
                      <Text style={[s.tileStatusText, { color }]}>{TABLE_STATUS_LABELS[st]}</Text>
                    </View>
                    {t.activeKOTCount > 0 && (
                      <Text style={s.kotCount}>
                        {t.activeKOTCount} ticket{t.activeKOTCount === 1 ? '' : 's'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 16 },
  muted: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '30%',
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  readyDot: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center',
  },
  tileNumber: { fontSize: 20, fontWeight: '800', color: Colors.text },
  tileSeats: { fontSize: 11, color: Colors.textSecondary },
  tileStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginTop: 2 },
  tileStatusText: { fontSize: 10, fontWeight: '700' },
  kotCount: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
});
