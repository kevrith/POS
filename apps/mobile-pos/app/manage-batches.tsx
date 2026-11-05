import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { expiryBucket, daysUntil, ExpiryBucket } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface Batch {
  id: string;
  lotNumber: string;
  expiryDate?: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  status: string;
  item?: { name: string } | null;
}

const BUCKET_COLOR: Record<ExpiryBucket, string> = {
  EXPIRED: Colors.error,
  CRITICAL: Colors.error,
  WARNING: Colors.warning,
  OK: Colors.success,
};
const BUCKET_LABEL: Record<ExpiryBucket, string> = {
  EXPIRED: 'Expired',
  CRITICAL: 'Expiring ≤7d',
  WARNING: 'Expiring ≤30d',
  OK: 'OK',
};

export default function ManageBatchesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { businessId } = useActiveStore();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<Batch[]>({
    queryKey: ['manage-batches', businessId],
    queryFn: () => mobileApi.get<Batch[]>(`/businesses/${businessId}/batch`),
    enabled: !!businessId,
    staleTime: 30_000,
  });

  const batches = useMemo(() => {
    const list = (Array.isArray(data) ? data : []).filter((b) => b.quantityRemaining > 0);
    const sorted = list.sort((a, b) => {
      const da = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const db = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return da - db;
    });
    if (showAll) return sorted;
    return sorted.filter((b) => expiryBucket(b.expiryDate) !== 'OK');
  }, [data, showAll]);

  const writeOff = useMutation({
    mutationFn: (id: string) =>
      mobileApi.patch(`/businesses/${businessId}/batch/${id}/write-off`, { authorizedBy: user?.name ?? user?.role ?? 'MANAGER' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-batches'] });
      qc.invalidateQueries({ queryKey: ['manage-expiring'] });
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Write-off failed.'),
  });

  const recall = useMutation({
    mutationFn: (id: string) => mobileApi.post(`/businesses/${businessId}/batch/${id}/recall`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manage-batches'] }),
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Recall failed.'),
  });

  function confirmWriteOff(b: Batch) {
    Alert.alert('Write off batch', `Write off ${b.quantityRemaining} unit(s) of ${b.item?.name ?? 'item'} (lot ${b.lotNumber})? This removes them from stock.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Write Off', style: 'destructive', onPress: () => writeOff.mutate(b.id) },
    ]);
  }
  function confirmRecall(b: Batch) {
    Alert.alert('Recall batch', `Recall lot ${b.lotNumber} of ${b.item?.name ?? 'item'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Recall', style: 'destructive', onPress: () => recall.mutate(b.id) },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Batches & Expiry</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.toggleWrap}>
          <TouchableOpacity style={[styles.toggleBtn, !showAll && styles.toggleActive]} onPress={() => setShowAll(false)}>
            <Text style={[styles.toggleText, !showAll && styles.toggleTextActive]}>Needs attention</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, showAll && styles.toggleActive]} onPress={() => setShowAll(true)}>
            <Text style={[styles.toggleText, showAll && styles.toggleTextActive]}>All batches</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item: b }) => {
            const bucket = expiryBucket(b.expiryDate);
            const days = b.expiryDate ? daysUntil(b.expiryDate) : null;
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemName}>{b.item?.name ?? 'Item'}</Text>
                    <Text style={styles.lot}>Lot {b.lotNumber} · {b.quantityRemaining} left</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: BUCKET_COLOR[bucket] + '18' }]}>
                    <Text style={[styles.badgeText, { color: BUCKET_COLOR[bucket] }]}>{BUCKET_LABEL[bucket]}</Text>
                  </View>
                </View>
                {b.expiryDate ? (
                  <Text style={styles.expiry}>
                    Expires {new Date(b.expiryDate).toLocaleDateString('en-KE')}
                    {days != null ? (days < 0 ? ` · ${Math.abs(days)}d ago` : ` · in ${days}d`) : ''}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: Colors.error }]} onPress={() => confirmWriteOff(b)}>
                    <Ionicons name="trash-outline" size={14} color={Colors.error} />
                    <Text style={[styles.smallBtnText, { color: Colors.error }]}>Write off</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: Colors.warning }]} onPress={() => confirmRecall(b)}>
                    <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                    <Text style={[styles.smallBtnText, { color: Colors.warning }]}>Recall</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={48} color={Colors.success} />
              <Text style={styles.emptyText}>{showAll ? 'No batches recorded' : 'Nothing expiring soon'}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.card, padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  toggleWrap: { flexDirection: 'row', backgroundColor: Colors.background, borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  toggleActive: { backgroundColor: Colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  list: { padding: 12, gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  lot: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  expiry: { fontSize: 12, color: Colors.text },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smallBtnText: { fontSize: 12, fontWeight: '600' },
});
