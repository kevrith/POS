import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { useActiveStoreOverride } from '../stores/activeStore';
import { canManageBusiness } from '../lib/roles';
import {
  rankStores, groupTotals, groupTopItems, rollupRange, PERIOD_LABELS,
  type CrossStoreResponse, type RollupPeriod,
} from '../lib/rollup';
import { Colors } from '../constants/theme';

/**
 * All stores at a glance, for an owner.
 *
 * The store switcher elsewhere in the app only ever shows ONE branch; this is
 * the consolidated view — group total, each branch ranked by take, and the
 * change against the previous window of the same length. Tapping a branch
 * switches the whole app to it, so the roll-up doubles as navigation.
 */
export default function RollupScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const { businessId, storeId } = useActiveStore();
  const setOverride = useActiveStoreOverride((s) => s.setOverride);
  const isOwner = canManageBusiness(role);

  const [period, setPeriod] = useState<RollupPeriod>('today');
  const { start, end, prevStart, prevEnd } = useMemo(() => rollupRange(period), [period]);

  const currentQ = useQuery<CrossStoreResponse>({
    queryKey: ['rollup', businessId, period, 'current'],
    queryFn: () =>
      mobileApi.get<CrossStoreResponse>(
        `/reports/cross-store-dashboard?businessId=${businessId}&startDate=${start.toISOString()}&endDate=${end.toISOString()}`,
      ),
    enabled: isOwner && !!businessId,
    staleTime: 60_000,
  });

  const previousQ = useQuery<CrossStoreResponse>({
    queryKey: ['rollup', businessId, period, 'previous'],
    queryFn: () =>
      mobileApi.get<CrossStoreResponse>(
        `/reports/cross-store-dashboard?businessId=${businessId}&startDate=${prevStart.toISOString()}&endDate=${prevEnd.toISOString()}`,
      ),
    enabled: isOwner && !!businessId,
    staleTime: 5 * 60_000,
  });

  const ranked = useMemo(
    () => rankStores(currentQ.data?.stores, previousQ.data?.stores),
    [currentQ.data, previousQ.data],
  );
  const totals = useMemo(() => groupTotals(currentQ.data?.stores), [currentQ.data]);
  const topItems = useMemo(() => groupTopItems(currentQ.data?.stores), [currentQ.data]);
  const groupChange = useMemo(() => {
    const prev = groupTotals(previousQ.data?.stores).totalRevenueCents;
    if (prev === 0) return null;
    return Math.round(((totals.totalRevenueCents - prev) / prev) * 1000) / 10;
  }, [previousQ.data, totals.totalRevenueCents]);

  if (!isOwner) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <Header onBack={() => router.back()} />
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={34} color={Colors.textSecondary} />
          <Text style={s.emptyTitle}>Owners only</Text>
          <Text style={s.emptySub}>Group figures across every branch are limited to owners and admins.</Text>
        </View>
      </SafeAreaView>
    );
  }

  /** Make a branch active app-wide, then return to where the owner came from. */
  function switchTo(id: string) {
    setOverride(id);
    router.back();
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <Header onBack={() => router.back()} />

      <View style={s.periodRow}>
        {(['today', 'week', 'month'] as RollupPeriod[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[s.periodChip, period === p && s.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodText, period === p && { color: '#FFF' }]}>{PERIOD_LABELS[p]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {currentQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={currentQ.isRefetching}
              onRefresh={() => { void currentQ.refetch(); void previousQ.refetch(); }}
              colors={[Colors.primary]}
            />
          }
        >
          {/* ── Group headline ── */}
          <View style={s.heroCard}>
            <Text style={s.heroLabel}>{PERIOD_LABELS[period]} · {totals.storeCount} {totals.storeCount === 1 ? 'branch' : 'branches'}</Text>
            <Text style={s.heroValue}>{formatKES(totals.totalRevenueCents)}</Text>
            {groupChange !== null && (
              <View style={s.changeRow}>
                <Ionicons
                  name={groupChange >= 0 ? 'trending-up' : 'trending-down'}
                  size={15}
                  color={groupChange >= 0 ? Colors.success : Colors.error}
                />
                <Text style={[s.changeText, { color: groupChange >= 0 ? Colors.success : Colors.error }]}>
                  {groupChange >= 0 ? '+' : ''}{groupChange}% vs previous
                </Text>
              </View>
            )}
            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Text style={s.heroStatValue}>{totals.totalTransactions}</Text>
                <Text style={s.heroStatLabel}>Sales</Text>
              </View>
              <View style={s.heroStat}>
                <Text style={s.heroStatValue}>{formatKES(totals.avgSaleCents)}</Text>
                <Text style={s.heroStatLabel}>Avg sale</Text>
              </View>
              <View style={s.heroStat}>
                <Text style={s.heroStatValue}>{formatKES(totals.totalVatCents)}</Text>
                <Text style={s.heroStatLabel}>VAT</Text>
              </View>
            </View>
          </View>

          {totals.silentStores > 0 && (
            <View style={s.warnRow}>
              <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
              <Text style={s.warnText}>
                {totals.silentStores} {totals.silentStores === 1 ? 'branch has' : 'branches have'} taken nothing this period.
              </Text>
            </View>
          )}

          {/* ── Per branch ── */}
          <Text style={s.sectionTitle}>By Branch</Text>
          {ranked.length === 0 ? (
            <View style={s.card}><Text style={s.muted}>No stores found for this business.</Text></View>
          ) : (
            ranked.map((store) => (
              <TouchableOpacity
                key={store.storeId}
                style={[s.card, store.storeId === storeId && s.activeCard]}
                onPress={() => switchTo(store.storeId)}
                activeOpacity={0.85}
              >
                <View style={s.rowBetween}>
                  <View style={s.nameRow}>
                    <View style={[s.rankBadge, store.rank === 1 && { backgroundColor: Colors.success + '20' }]}>
                      <Text style={[s.rankText, store.rank === 1 && { color: Colors.success }]}>{store.rank}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.storeName}>{store.storeName}</Text>
                      <Text style={s.storeCode}>{store.storeCode}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.storeRevenue}>{formatKES(store.totalRevenueCents)}</Text>
                    {store.changePct !== null && (
                      <Text style={[s.storeChange, { color: store.changePct >= 0 ? Colors.success : Colors.error }]}>
                        {store.changePct >= 0 ? '+' : ''}{store.changePct}%
                      </Text>
                    )}
                  </View>
                </View>

                {/* Share-of-group bar */}
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${Math.max(2, store.sharePct)}%` }]} />
                </View>
                <View style={s.rowBetween}>
                  <Text style={s.meta}>
                    {store.transactionCount} sales · avg {formatKES(store.avgSaleCents)}
                  </Text>
                  <Text style={s.meta}>{store.sharePct}% of group</Text>
                </View>

                {store.storeId === storeId && <Text style={s.activeHint}>Currently viewing this branch</Text>}
              </TouchableOpacity>
            ))
          )}

          {/* ── Group best sellers ── */}
          {topItems.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Best Sellers (group)</Text>
              <View style={s.card}>
                {topItems.map((item, i) => (
                  <View key={item.name} style={[s.itemRow, i > 0 && s.itemRowDivided]}>
                    <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.itemRevenue}>{formatKES(item.revenueCents)}</Text>
                      <Text style={s.meta}>{item.qtySold} sold</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>
      <Text style={s.headerTitle}>All Stores</Text>
      <View style={{ width: 30 }} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 6 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  periodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  periodChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.background },
  periodChipActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  heroCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 20, gap: 4 },
  heroLabel: { fontSize: 12, color: Colors.textSecondary },
  heroValue: { fontSize: 30, fontWeight: '800', color: Colors.text },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  changeText: { fontSize: 13, fontWeight: '700' },
  heroStats: { flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 14 },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  heroStatLabel: { fontSize: 11, color: Colors.textSecondary },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning + '14', borderRadius: 12, padding: 12 },
  warnText: { flex: 1, fontSize: 12, color: Colors.text },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 8 },
  activeCard: { borderWidth: 1, borderColor: Colors.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
  rankText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  storeName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  storeCode: { fontSize: 11, color: Colors.textSecondary },
  storeRevenue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  storeChange: { fontSize: 11, fontWeight: '700' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.background, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  meta: { fontSize: 11, color: Colors.textSecondary },
  muted: { fontSize: 13, color: Colors.textSecondary },
  activeHint: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 12 },
  itemRowDivided: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemName: { fontSize: 14, color: Colors.text, flex: 1 },
  itemRevenue: { fontSize: 14, fontWeight: '700', color: Colors.text },
});
