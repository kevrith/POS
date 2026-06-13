/**
 * Today — agent home. Shows month stats summary + the call plan
 * (customers to visit today, prioritised by outstanding balance).
 */
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { agentApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { Colors, PRIORITY_COLORS } from '../../constants/theme';

interface AgentStats {
  ordersToday: number;
  valueTodayCents: number;
  ordersThisMonth: number;
  valueThisMonthCents: number;
  commissionEarnedCents: number;
  commissionTargetCents: number;
  daysLeftInMonth: number;
}

interface CallPlanCustomer {
  id: string;
  name: string;
  phone: string;
  shopCode: string;
  shopType: string | null;
  outstandingCents: number;
  creditLimitCents: number;
  lastVisit: string | null;
  daysSinceVisit: number | null;
  totalOrders: number;
  priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
}

export default function TodayScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const businessId = user?.businessId ?? '';
  const agentId = user?.id ?? '';
  const now = new Date();

  const stats = useQuery<AgentStats>({
    queryKey: ['agent-stats', agentId, businessId],
    queryFn: () => agentApi.get<AgentStats>(
      `/field-sales/agent-stats?agentId=${agentId}&businessId=${businessId}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`,
    ),
    enabled: !!agentId && !!businessId,
  });

  const callPlan = useQuery<CallPlanCustomer[]>({
    queryKey: ['call-plan', agentId, businessId],
    queryFn: () => agentApi.get<CallPlanCustomer[]>(`/field-sales/call-plan?agentId=${agentId}&businessId=${businessId}`),
    enabled: !!agentId && !!businessId,
  });

  const refreshing = stats.isRefetching || callPlan.isRefetching;
  function refetchAll() { void stats.refetch(); void callPlan.refetch(); }

  function startOrder(c: CallPlanCustomer) {
    setCustomer(c.id, c.name);
    router.push('/(tabs)/order');
  }

  const s = stats.data;
  const commissionPct = s && s.commissionTargetCents > 0
    ? Math.min(100, Math.round((s.commissionEarnedCents / s.commissionTargetCents) * 100))
    : 0;

  return (
    <View style={st.safe}>
      <View style={st.header}>
        <View>
          <Text style={st.greeting}>Hi, {user?.name?.split(' ')[0] ?? 'Agent'}</Text>
          <Text style={st.subGreeting}>{now.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
        </View>
        <Ionicons name="briefcase" size={28} color={Colors.primary} />
      </View>

      <FlatList
        data={callPlan.data ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={Colors.primary} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            {/* Stat cards */}
            <View style={st.statRow}>
              <View style={st.statCard}>
                <Text style={st.statValue}>{s?.ordersToday ?? '—'}</Text>
                <Text style={st.statLabel}>Orders Today</Text>
              </View>
              <View style={st.statCard}>
                <Text style={st.statValue}>{s ? formatKES(s.valueTodayCents).replace('KES ', '') : '—'}</Text>
                <Text style={st.statLabel}>Sales Today (KES)</Text>
              </View>
            </View>
            <View style={st.statRow}>
              <View style={st.statCard}>
                <Text style={st.statValue}>{s?.ordersThisMonth ?? '—'}</Text>
                <Text style={st.statLabel}>Orders (Month)</Text>
              </View>
              <View style={st.statCard}>
                <Text style={st.statValue}>{s ? formatKES(s.valueThisMonthCents).replace('KES ', '') : '—'}</Text>
                <Text style={st.statLabel}>Sales (Month)</Text>
              </View>
            </View>

            {/* Commission progress */}
            {s && (
              <View style={st.commCard}>
                <View style={st.commHeader}>
                  <Text style={st.commTitle}>Commission this month</Text>
                  <Text style={st.commValue}>{formatKES(s.commissionEarnedCents)}</Text>
                </View>
                <View style={st.progressTrack}>
                  <View style={[st.progressFill, { width: `${commissionPct}%` }]} />
                </View>
                <Text style={st.commSub}>{commissionPct}% of target · {s.daysLeftInMonth} days left</Text>
              </View>
            )}

            <Text style={st.sectionTitle}>Call Plan ({callPlan.data?.length ?? 0})</Text>
            {callPlan.isLoading && <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} />}
          </View>
        }
        ListEmptyComponent={
          !callPlan.isLoading ? (
            <View style={st.empty}>
              <Ionicons name="people-outline" size={40} color={Colors.textSecondary} />
              <Text style={st.emptyText}>No customers assigned yet.</Text>
              <Text style={st.emptySub}>Register a customer to get started.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={st.callCard}>
            <View style={[st.priorityBar, { backgroundColor: PRIORITY_COLORS[item.priority] }]} />
            <View style={{ flex: 1 }}>
              <View style={st.callTop}>
                <Text style={st.callName} numberOfLines={1}>{item.name}</Text>
                <Text style={st.shopCode}>{item.shopCode}</Text>
              </View>
              <Text style={st.callMeta}>
                {item.daysSinceVisit != null ? `Visited ${item.daysSinceVisit}d ago` : 'Never visited'} · {item.totalOrders} orders
              </Text>
              {item.outstandingCents > 0 && (
                <Text style={st.outstanding}>Owes {formatKES(item.outstandingCents)}</Text>
              )}
              <View style={st.callActions}>
                <TouchableOpacity style={st.actionBtn} onPress={() => startOrder(item)}>
                  <Ionicons name="cart" size={15} color="#FFF" />
                  <Text style={st.actionBtnText}>Order</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[st.actionBtn, st.actionBtnGhost]} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                  <Ionicons name="call" size={15} color={Colors.primary} />
                  <Text style={[st.actionBtnText, { color: Colors.primary }]}>Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  greeting: { fontSize: 22, fontWeight: '800', color: Colors.text },
  subGreeting: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  commCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: Colors.primaryDark, borderRadius: 14, padding: 16 },
  commHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commTitle: { fontSize: 13, color: '#FFEDD5', fontWeight: '600' },
  commValue: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#FB923C', borderRadius: 4 },
  commSub: { fontSize: 11, color: '#FFEDD5', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, paddingHorizontal: 16, marginBottom: 8 },
  callCard: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.card,
    borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  priorityBar: { width: 5 },
  callTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingBottom: 2 },
  callName: { fontSize: 15, fontWeight: '700', color: Colors.text, flex: 1 },
  shopCode: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'monospace' },
  callMeta: { fontSize: 12, color: Colors.textSecondary, paddingHorizontal: 12 },
  outstanding: { fontSize: 12, color: Colors.error, fontWeight: '600', paddingHorizontal: 12, marginTop: 2 },
  callActions: { flexDirection: 'row', gap: 8, padding: 12, paddingTop: 8 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primary,
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: 8,
  },
  actionBtnGhost: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40, gap: 6 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary },
});
