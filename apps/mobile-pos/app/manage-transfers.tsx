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
import { useRouter } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { Colors } from '../constants/theme';

interface Transfer {
  id: string;
  status: string;
  fromStoreId: string;
  toStoreId: string;
  createdAt: string;
  notes?: string;
  items: Array<{ itemId: string; quantity: number }>;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.primary,
  COMPLETED: Colors.success,
  CANCELLED: Colors.textSecondary,
  REJECTED: Colors.error,
};

export default function ManageTransfersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { businessId, storeId, stores } = useActiveStore();

  const { data, isLoading, refetch, isRefetching } = useQuery<Transfer[]>({
    queryKey: ['manage-transfers', businessId, storeId],
    queryFn: () => mobileApi.get<Transfer[]>(`/transfers?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 15_000,
  });

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id.slice(0, 6);
  const who = user?.id ?? user?.name ?? 'manager';

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'receive' | 'reject' | 'cancel' }) => {
      const body =
        action === 'approve' ? { approvedBy: who } : action === 'receive' ? { receivedBy: who } : {};
      return mobileApi.patch(`/transfers/${id}/${action}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-transfers'] });
      qc.invalidateQueries({ queryKey: ['manage-stock'] });
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Action failed.'),
  });

  function confirm(action: 'approve' | 'receive' | 'reject' | 'cancel', id: string) {
    const labels = { approve: 'Approve', receive: 'Mark received', reject: 'Reject', cancel: 'Cancel' };
    Alert.alert(`${labels[action]} transfer`, 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', style: action === 'reject' || action === 'cancel' ? 'destructive' : 'default', onPress: () => act.mutate({ id, action }) },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stock Transfers</Text>
        <TouchableOpacity onPress={() => router.push('/manage-transfer-new')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Add" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="add-circle" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item: t }) => {
            const incoming = t.toStoreId === storeId;
            const qty = t.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.routeWrap}>
                    <Text style={styles.routeText}>{storeName(t.fromStoreId)}</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.textSecondary} />
                    <Text style={styles.routeText}>{storeName(t.toStoreId)}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[t.status] ?? Colors.textSecondary) + '18' }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[t.status] ?? Colors.textSecondary }]}>{t.status}</Text>
                  </View>
                </View>
                <Text style={styles.sub}>
                  {t.items.length} item(s) · {qty} unit(s) · {new Date(t.createdAt).toLocaleDateString('en-KE')}
                  {incoming ? ' · incoming' : ' · outgoing'}
                </Text>
                {(t.status === 'PENDING' || t.status === 'APPROVED') && (
                  <View style={styles.actions}>
                    {t.status === 'PENDING' && (
                      <TouchableOpacity style={[styles.smallBtn, { borderColor: Colors.primary }]} onPress={() => confirm('approve', t.id)}>
                        <Text style={[styles.smallBtnText, { color: Colors.primary }]}>Approve</Text>
                      </TouchableOpacity>
                    )}
                    {t.status === 'APPROVED' && incoming && (
                      <TouchableOpacity style={[styles.smallBtn, { borderColor: Colors.success }]} onPress={() => confirm('receive', t.id)}>
                        <Text style={[styles.smallBtnText, { color: Colors.success }]}>Receive</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.smallBtn, { borderColor: Colors.error }]} onPress={() => confirm(t.status === 'PENDING' ? 'reject' : 'cancel', t.id)}>
                      <Text style={[styles.smallBtnText, { color: Colors.error }]}>{t.status === 'PENDING' ? 'Reject' : 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="swap-horizontal-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No transfers yet</Text>
              <TouchableOpacity style={styles.addEmptyBtn} onPress={() => router.push('/manage-transfer-new')}>
                <Text style={styles.addEmptyText}>New Transfer</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  addEmptyBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addEmptyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
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
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  routeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  routeText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  sub: { fontSize: 12, color: Colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
});
