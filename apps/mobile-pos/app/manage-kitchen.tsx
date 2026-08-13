import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth';
import { mobileApi } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { minutesSince, ticketAge, type OrderLine, type TicketAge } from '../lib/hospitality';
import { Colors } from '../constants/theme';

interface KitchenOrder {
  id: string;
  createdAt: string;
  table?: { number: string } | null;
  waiter?: { name: string } | null;
  items: OrderLine[];
  kots?: Array<{ id: string; kotNumber: number; status: string }>;
}

const AGE_COLOR: Record<TicketAge, string> = {
  fresh: Colors.success,
  warm: Colors.warning,
  late: Colors.error,
};

/**
 * Kitchen display on a phone: every open ticket, oldest first, coloured by how
 * long it has been waiting, with one tap to move a ticket along.
 *
 * The web KDS assumes a screen bolted to the pass. This is the same data for a
 * kitchen that has a phone instead — and for a manager who wants to see the
 * backlog without walking in.
 */
export default function KitchenScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const chefId = useAuthStore((s) => s.user?.id) ?? '';
  const { storeId } = useActiveStore();

  const ordersQ = useQuery<KitchenOrder[]>({
    queryKey: ['kitchen', storeId],
    queryFn: () => mobileApi.get<KitchenOrder[]>(`/hospitality/kitchen/orders?storeId=${storeId}`),
    enabled: !!storeId,
    // A kitchen screen that is 60 seconds stale is worse than useless.
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const kotMut = useMutation({
    mutationFn: ({ kotId, status }: { kotId: string; status: string }) =>
      mobileApi.patch(`/hospitality/kot/${kotId}/status`, { status, chefId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitchen'] });
      qc.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (e: any) => Alert.alert('Could not update the ticket', e?.message ?? 'Please try again.'),
  });

  const orders = ordersQ.data ?? [];

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Kitchen</Text>
        <View style={s.countPill}>
          <Text style={s.countText}>{orders.length}</Text>
        </View>
      </View>

      {ordersQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={ordersQ.isRefetching} onRefresh={() => void ordersQ.refetch()} colors={[Colors.primary]} />}
        >
          {orders.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="checkmark-done-circle-outline" size={44} color={Colors.success} />
              <Text style={s.emptyTitle}>Nothing cooking</Text>
              <Text style={s.emptySub}>New orders appear here the moment a waiter sends them.</Text>
            </View>
          ) : (
            orders.map((o) => {
              const mins = minutesSince(o.createdAt);
              const age = ticketAge(mins);
              const color = AGE_COLOR[age];
              // Tickets already marked READY are done from the kitchen's side.
              const activeKot = (o.kots ?? []).find((k) => k.status !== 'READY' && k.status !== 'SERVED');
              return (
                <View key={o.id} style={[s.ticket, { borderLeftColor: color }]}>
                  <View style={s.ticketTop}>
                    <Text style={s.tableName}>
                      {o.table?.number ? `Table ${o.table.number}` : 'Takeaway'}
                    </Text>
                    <View style={[s.agePill, { backgroundColor: color + '1A' }]}>
                      <Ionicons name="time-outline" size={12} color={color} />
                      <Text style={[s.ageText, { color }]}>{mins}m</Text>
                    </View>
                  </View>
                  {o.waiter?.name ? <Text style={s.waiter}>{o.waiter.name}</Text> : null}

                  <View style={s.lines}>
                    {o.items.map((l) => (
                      <View key={l.id} style={s.lineRow}>
                        <Text style={s.lineQty}>{l.quantity}×</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.lineName}>{l.name}</Text>
                          {l.specialInstructions ? (
                            <Text style={s.lineNote}>{l.specialInstructions}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>

                  {activeKot && (
                    <View style={s.actionRow}>
                      {activeKot.status === 'PENDING' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: Colors.primary }]}
                          onPress={() => kotMut.mutate({ kotId: activeKot.id, status: 'IN_PROGRESS' })}
                          disabled={kotMut.isPending}
                        >
                          <Ionicons name="flame-outline" size={16} color="#FFF" />
                          <Text style={s.actionText}>Start cooking</Text>
                        </TouchableOpacity>
                      )}
                      {activeKot.status === 'IN_PROGRESS' && (
                        <TouchableOpacity
                          style={[s.actionBtn, { backgroundColor: Colors.success }]}
                          onPress={() => kotMut.mutate({ kotId: activeKot.id, status: 'READY' })}
                          disabled={kotMut.isPending}
                        >
                          <Ionicons name="checkmark" size={16} color="#FFF" />
                          <Text style={s.actionText}>Mark ready</Text>
                        </TouchableOpacity>
                      )}
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
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  countPill: { minWidth: 30, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: Colors.primary + '18', alignItems: 'center' },
  countText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 70 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 6 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 40 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  ticket: { backgroundColor: Colors.card, borderRadius: 14, borderLeftWidth: 4, padding: 14, gap: 6 },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tableName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  agePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  ageText: { fontSize: 12, fontWeight: '800' },
  waiter: { fontSize: 12, color: Colors.textSecondary },
  lines: { gap: 3, marginTop: 4 },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  lineQty: { fontSize: 15, fontWeight: '800', color: Colors.primary, minWidth: 28 },
  lineName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  lineNote: { fontSize: 12, color: Colors.warning, fontStyle: 'italic', marginTop: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 11, borderRadius: 10 },
  actionText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
