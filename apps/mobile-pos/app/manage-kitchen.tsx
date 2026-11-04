import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, RefreshControl, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';
import { mobileApi } from '../lib/api';
import { clearPushToken } from '../lib/push';
import { useActiveStore } from '../lib/useActiveStore';
import {
  KOT_STATIONS, STATION_LABELS, minutesSince, ticketAge, ticketActions, ticketLocation, ticketsForStation,
  modifierNames, type KdsTicket, type KotStation, type TicketAge, type TicketAction,
} from '../lib/hospitality';
import { Colors } from '../constants/theme';

const AGE_COLOR: Record<TicketAge, string> = {
  fresh: Colors.success,
  warm: Colors.warning,
  late: Colors.error,
};

const STATION_ICON: Record<KotStation | 'ALL', keyof typeof Ionicons.glyphMap> = {
  ALL: 'apps-outline',
  KITCHEN: 'restaurant-outline',
  BAR: 'wine-outline',
  DESSERT: 'ice-cream-outline',
};

const STATION_KEY = 'kds_station';

const TONE_BG: Record<TicketAction['tone'], string> = {
  primary: Colors.primary,
  success: Colors.success,
  neutral: Colors.textSecondary,
};

/**
 * Kitchen display on a phone: every live ticket, oldest first, coloured by how
 * long it has been waiting, with the buttons that move it along.
 *
 * It reads the same per-ticket feed as the web display (one card per ticket,
 * showing only the lines on it), so a bar phone and a kitchen screen never see
 * each other's food. A kitchen account lands here directly and signs out here,
 * since it has no other screen.
 */
export default function KitchenScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearCart = useCartStore((s) => s.clearCart);
  const { storeId } = useActiveStore();
  const role = user?.role;
  const kitchenOnly = (role ?? '').toUpperCase() === 'KITCHEN';

  // A bar phone shows only the bar; the choice sticks to the device.
  const [station, setStation] = useState<KotStation | 'ALL'>('ALL');
  useEffect(() => {
    SecureStore.getItemAsync(STATION_KEY)
      .then((v) => { if (v && (KOT_STATIONS as readonly string[]).includes(v)) setStation(v as KotStation); })
      .catch(() => {});
  }, []);
  function chooseStation(next: KotStation | 'ALL') {
    setStation(next);
    SecureStore.setItemAsync(STATION_KEY, next).catch(() => {});
  }

  const ticketsQ = useQuery<KdsTicket[]>({
    queryKey: ['kitchen', storeId],
    queryFn: () => mobileApi.get<KdsTicket[]>(`/hospitality/kds/orders?storeId=${storeId}`),
    enabled: !!storeId,
    // A kitchen screen that is a minute stale is worse than useless.
    refetchInterval: 10_000,
    staleTime: 4_000,
  });

  const kotMut = useMutation({
    mutationFn: ({ kotId, status }: { kotId: string; status: string }) =>
      mobileApi.patch(`/hospitality/kot/${kotId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitchen'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    },
    onError: (e: any) => {
      // A conflict means another screen moved the ticket first; show what is true now.
      Alert.alert('Could not update the ticket', e?.message ?? 'Please try again.');
      qc.invalidateQueries({ queryKey: ['kitchen'] });
    },
  });

  const all = ticketsQ.data ?? [];
  const tickets = useMemo(() => ticketsForStation(all, station), [all, station]);
  const counts = useMemo(() => {
    const c: Record<KotStation | 'ALL', number> = { ALL: all.length, KITCHEN: 0, BAR: 0, DESSERT: 0 };
    for (const t of all) c[t.station] = (c[t.station] ?? 0) + 1;
    return c;
  }, [all]);

  // Buzz when a new ticket lands for the station on screen. Skipped on first load.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(tickets.filter((t) => t.status === 'PENDING').map((t) => t.id));
    if (seen.current && [...ids].some((id) => !seen.current!.has(id))) Vibration.vibrate([0, 200, 120, 200]);
    seen.current = ids;
  }, [tickets]);

  function signOut() {
    Alert.alert('Sign out', 'Sign out of the kitchen screen?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          if (user?.id) void clearPushToken(user.id);
          clearCart();
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        {kitchenOnly ? (
          <View style={s.backBtn} />
        ) : (
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        )}
        <Text style={s.headerTitle}>Kitchen</Text>
        {kitchenOnly ? (
          <TouchableOpacity onPress={signOut} style={s.backBtn} accessibilityLabel="Sign out">
            <Ionicons name="log-out-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={s.countPill}>
            <Text style={s.countText}>{tickets.length}</Text>
          </View>
        )}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {(['ALL', ...KOT_STATIONS] as Array<KotStation | 'ALL'>).map((st) => {
            const active = station === st;
            return (
              <TouchableOpacity
                key={st}
                onPress={() => chooseStation(st)}
                style={[s.chip, active && s.chipActive]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={STATION_ICON[st]} size={15} color={active ? '#FFF' : Colors.textSecondary} />
                <Text style={[s.chipText, active && { color: '#FFF' }]}>{st === 'ALL' ? 'All' : STATION_LABELS[st]}</Text>
                <Text style={[s.chipCount, active && { color: '#FFF' }]}>{counts[st]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {ticketsQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={ticketsQ.isRefetching} onRefresh={() => void ticketsQ.refetch()} colors={[Colors.primary]} />}
        >
          {ticketsQ.isError ? (
            <View style={s.center}>
              <Ionicons name="cloud-offline-outline" size={44} color={Colors.error} />
              <Text style={s.emptyTitle}>Cannot reach the server</Text>
              <Text style={s.emptySub}>Pull down to try again. Tickets already on screen may be out of date.</Text>
            </View>
          ) : tickets.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="checkmark-done-circle-outline" size={44} color={Colors.success} />
              <Text style={s.emptyTitle}>Nothing cooking</Text>
              <Text style={s.emptySub}>New orders appear here the moment a waiter sends them.</Text>
            </View>
          ) : (
            tickets.map((t) => {
              const mins = minutesSince(t.createdAt);
              const age = t.status === 'READY' ? 'fresh' : ticketAge(mins);
              const color = AGE_COLOR[age];
              const actions = ticketActions(t, role);
              return (
                <View key={t.id} style={[s.ticket, { borderLeftColor: color }]}>
                  <View style={s.ticketTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.tableName}>{ticketLocation(t)}</Text>
                      <Text style={s.meta}>
                        #{t.kotNumber} · {STATION_LABELS[t.station] ?? t.station}
                        {t.order.waiter?.name ? ` · ${t.order.waiter.name}` : ''}
                      </Text>
                    </View>
                    <View style={[s.agePill, { backgroundColor: color + '1A' }]}>
                      <Ionicons name={age === 'late' ? 'alert-circle-outline' : 'time-outline'} size={12} color={color} />
                      <Text style={[s.ageText, { color }]}>{mins}m</Text>
                    </View>
                  </View>

                  <View style={s.flags}>
                    <Text style={[s.statusTag, t.status === 'READY' && { color: Colors.success }]}>
                      {t.status === 'IN_PROGRESS' ? 'COOKING' : t.status}
                    </Text>
                    {t.type === 'ADDITION' && <Text style={[s.flag, { backgroundColor: '#0EA5E9' }]}>ADD-ON</Text>}
                    {t.order.isVIP && <Text style={[s.flag, { backgroundColor: Colors.warning }]}>VIP</Text>}
                    {t.assignedChef?.name ? <Text style={s.chef}>Chef {t.assignedChef.name}</Text> : null}
                  </View>

                  <View style={s.lines}>
                    {t.order.items.length === 0 && <Text style={s.muted}>Lines on this ticket were voided</Text>}
                    {t.order.items.map((l) => {
                      const mods = modifierNames(l.modifiers);
                      return (
                        <View key={l.id} style={s.lineRow}>
                          <Text style={s.lineQty}>{l.quantity}×</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={s.lineName}>{l.name}</Text>
                            {mods.map((m) => <Text key={m} style={s.lineMod}>+ {m}</Text>)}
                            {l.specialInstructions ? <Text style={s.lineNote}>{l.specialInstructions}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {actions.length > 0 && (
                    <View style={s.actionRow}>
                      {actions.map((a) => (
                        <TouchableOpacity
                          key={a.to}
                          style={[s.actionBtn, { backgroundColor: TONE_BG[a.tone] }]}
                          onPress={() => kotMut.mutate({ kotId: t.id, status: a.to })}
                          disabled={kotMut.isPending}
                          accessibilityLabel={`${a.label}, ${ticketLocation(t)}`}
                        >
                          <Text style={s.actionText}>{a.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 44, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  countPill: { minWidth: 30, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.primary + '18', alignItems: 'center' },
  countText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipCount: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 70 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 6 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  ticket: { backgroundColor: Colors.card, borderRadius: 14, borderLeftWidth: 5, padding: 14, gap: 8 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  tableName: { fontSize: 18, fontWeight: '800', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  agePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  ageText: { fontSize: 12, fontWeight: '800' },
  flags: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  statusTag: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
  flag: { fontSize: 10, fontWeight: '800', color: '#FFF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chef: { fontSize: 12, color: Colors.textSecondary },
  muted: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  lines: { gap: 6, marginTop: 2 },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineQty: { fontSize: 17, fontWeight: '800', color: Colors.primary, minWidth: 32 },
  lineName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  lineMod: { fontSize: 13, color: Colors.text, marginTop: 1 },
  lineNote: { fontSize: 13, fontWeight: '700', color: Colors.warning, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 48, borderRadius: 10 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
