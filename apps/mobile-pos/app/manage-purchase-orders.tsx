import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import {
  poProgress, poTotalCents, normalizePoStatus, canReceive,
  PO_STATUS_LABELS, type PurchaseOrder, type PoStatus,
} from '../lib/receiving';
import { Colors } from '../constants/theme';

const STATUS_COLOR: Record<PoStatus, string> = {
  DRAFT: Colors.textSecondary,
  SUBMITTED: Colors.warning,
  APPROVED: Colors.primary,
  PARTIALLY_RECEIVED: Colors.indigo,
  RECEIVED: Colors.success,
  CANCELLED: Colors.error,
};

type Filter = 'OPEN' | 'ALL' | 'APPROVED' | 'RECEIVED';

/**
 * Purchase orders, built around the one thing that actually happens on a phone:
 * standing at the back door with a delivery, finding the PO, and booking in what
 * arrived. "Open" is the default filter for exactly that reason.
 */
export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const { businessId } = useActiveStore();
  const [filter, setFilter] = useState<Filter>('OPEN');

  const posQ = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', businessId],
    queryFn: () => mobileApi.get<PurchaseOrder[]>(`/suppliers/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  const all = posQ.data ?? [];
  const rows = all.filter((po) => {
    const st = normalizePoStatus(po.status);
    if (filter === 'ALL') return true;
    if (filter === 'OPEN') return st !== 'RECEIVED' && st !== 'CANCELLED';
    return st === filter;
  });

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Purchase Orders</Text>
        <TouchableOpacity onPress={() => router.push('/manage-suppliers' as any)} style={s.backBtn}>
          <Ionicons name="business-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.filterRow}>
        {(['OPEN', 'APPROVED', 'RECEIVED', 'ALL'] as Filter[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterChip, filter === f && s.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>
              {f === 'OPEN' ? 'Open' : f === 'ALL' ? 'All' : PO_STATUS_LABELS[f as PoStatus]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {posQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={posQ.isRefetching} onRefresh={() => void posQ.refetch()} colors={[Colors.primary]} />}
        >
          {rows.length === 0 ? (
            <View style={s.card}>
              <Text style={s.muted}>
                No purchase orders here. Create them on the web app — this screen is for approving
                and receiving them.
              </Text>
            </View>
          ) : (
            rows.map((po) => {
              const st = normalizePoStatus(po.status);
              const color = STATUS_COLOR[st];
              const progress = poProgress(po);
              return (
                <TouchableOpacity
                  key={po.id}
                  style={s.card}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/purchase-order?poId=${po.id}` as any)}
                >
                  <View style={s.rowBetween}>
                    <Text style={s.poNumber}>{po.poNumber}</Text>
                    <View style={[s.statusPill, { backgroundColor: color + '1A' }]}>
                      <Text style={[s.statusText, { color }]}>{PO_STATUS_LABELS[st]}</Text>
                    </View>
                  </View>

                  <Text style={s.supplier}>{po.supplier?.name ?? 'Supplier'}</Text>

                  <View style={s.rowBetween}>
                    <Text style={s.meta}>
                      {progress.lines} line{progress.lines === 1 ? '' : 's'} · {progress.unitsReceived}/{progress.unitsOrdered} units
                    </Text>
                    <Text style={s.total}>{formatKES(poTotalCents(po))}</Text>
                  </View>

                  {progress.percent > 0 && progress.percent < 100 && (
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${progress.percent}%` }]} />
                    </View>
                  )}

                  {canReceive(po.status) && (
                    <View style={s.receiveHint}>
                      <Ionicons name="download-outline" size={14} color={Colors.success} />
                      <Text style={s.receiveHintText}>Ready to receive</Text>
                    </View>
                  )}
                </TouchableOpacity>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.background },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  poNumber: { fontSize: 15, fontWeight: '800', color: Colors.text },
  supplier: { fontSize: 13, color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  total: { fontSize: 14, fontWeight: '700', color: Colors.text },
  muted: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '800' },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden', marginTop: 2 },
  barFill: { height: 5, borderRadius: 3, backgroundColor: Colors.indigo },
  receiveHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  receiveHintText: { fontSize: 12, fontWeight: '700', color: Colors.success },
});
