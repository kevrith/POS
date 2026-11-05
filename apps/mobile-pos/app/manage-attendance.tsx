import { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { canManage } from '../lib/roles';
import {
  currentlyOnShift, todaysEntries, shiftHours, formatDuration, totalHours,
  type TimeEntry,
} from '../lib/hr';
import { Colors } from '../constants/theme';

/**
 * Who is on the clock, for a manager or owner.
 *
 * The oversight half of [my-hr]: same time-entry data, read across the whole
 * team instead of one person. Answers "is the shop actually staffed right now"
 * without a phone call.
 */
export default function AttendanceScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const { businessId } = useActiveStore();
  const isManager = canManage(role);

  const entriesQ = useQuery<TimeEntry[]>({
    queryKey: ['attendance-board', businessId],
    queryFn: () => mobileApi.get<TimeEntry[]>(`/hr/time-entries?businessId=${businessId}`),
    enabled: isManager && !!businessId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const all = entriesQ.data ?? [];
  const onShift = useMemo(() => currentlyOnShift(all), [all]);
  const today = useMemo(() => todaysEntries(all), [all]);
  const doneToday = today.filter((e) => e.clockOut !== null);

  if (!isManager) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <Header onBack={() => router.back()} />
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={34} color={Colors.textSecondary} />
          <Text style={s.emptyTitle}>Managers only</Text>
          <Text style={s.emptySub}>Your own shifts are on the My HR screen in Settings.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <Header onBack={() => router.back()} />

      {entriesQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={entriesQ.isRefetching} onRefresh={() => void entriesQ.refetch()} colors={[Colors.primary]} />}
        >
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: Colors.success }]}>{onShift.length}</Text>
              <Text style={s.statLabel}>On shift now</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{today.length}</Text>
              <Text style={s.statLabel}>Shifts today</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statValue}>{totalHours(today)}h</Text>
              <Text style={s.statLabel}>Hours today</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>On Shift Now</Text>
          {onShift.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>Nobody is clocked in right now.</Text>
            </View>
          ) : (
            onShift.map((e) => (
              <View key={e.id} style={s.card}>
                <View style={s.rowBetween}>
                  <View style={s.nameRow}>
                    <View style={s.liveDot} />
                    <Text style={s.name}>{e.user?.name ?? 'Unknown'}</Text>
                  </View>
                  <Text style={s.duration}>{formatDuration(e.clockIn)}</Text>
                </View>
                <Text style={s.meta}>
                  {e.user?.role ?? ''} · in at{' '}
                  {new Date(e.clockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))
          )}

          <Text style={s.sectionTitle}>Finished Today</Text>
          {doneToday.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>No completed shifts today yet.</Text>
            </View>
          ) : (
            doneToday.map((e) => (
              <View key={e.id} style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.name}>{e.user?.name ?? 'Unknown'}</Text>
                  <Text style={s.hours}>{shiftHours(e)}h</Text>
                </View>
                <Text style={s.meta}>
                  {new Date(e.clockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {new Date(e.clockOut!).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))
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
      <Text style={s.headerTitle}>Team & Attendance</Text>
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
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 19, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 10, color: Colors.textSecondary, textAlign: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  duration: { fontSize: 14, fontWeight: '700', color: Colors.success },
  hours: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  meta: { fontSize: 12, color: Colors.textSecondary },
  muted: { fontSize: 13, color: Colors.textSecondary },
});
