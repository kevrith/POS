import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { Colors } from '../constants/theme';

interface Session {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  notes?: string;
  _count?: { counts: number };
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: Colors.textSecondary,
  IN_PROGRESS: Colors.warning,
  FINALIZED: Colors.success,
};

export default function ManageStocktakeScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { businessId, storeId } = useActiveStore();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery<Session[]>({
    queryKey: ['stocktake-sessions', businessId, storeId],
    queryFn: () => mobileApi.get<Session[]>(`/stocktake/sessions?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: (body: { name: string }) =>
      mobileApi.post<Session>('/stocktake/sessions', {
        businessId,
        storeId,
        name: body.name,
        createdBy: user?.id ?? user?.name ?? 'manager',
      }),
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: ['stocktake-sessions'] });
      setShowNew(false);
      setName('');
      if (session?.id) router.push(`/manage-stocktake-session?id=${session.id}`);
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Could not start stock take.'),
  });

  function startNew() {
    const defName = name.trim() || `Stock take ${new Date().toLocaleDateString('en-KE')}`;
    create.mutate({ name: defName });
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stock Take</Text>
        <TouchableOpacity onPress={() => setShowNew(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Add" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="add-circle" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/manage-stocktake-session?id=${s.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.sub}>
                  {s._count?.counts ?? 0} items · {new Date(s.createdAt).toLocaleDateString('en-KE')}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLOR[s.status] ?? Colors.textSecondary) + '18' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[s.status] ?? Colors.textSecondary }]}>
                  {s.status.replace('_', ' ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.border} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="clipboard-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No stock takes yet</Text>
              <TouchableOpacity style={styles.addEmptyBtn} onPress={() => setShowNew(true)}>
                <Text style={styles.addEmptyText}>Start Stock Take</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <Modal visible={showNew} animationType="slide" transparent onRequestClose={() => setShowNew(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Stock Take</Text>
              <TouchableOpacity onPress={() => setShowNew(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>A count sheet is generated from current stock for every tracked item in this store.</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={`Stock take ${new Date().toLocaleDateString('en-KE')}`}
              placeholderTextColor={Colors.textSecondary}
            />
            <TouchableOpacity style={[styles.saveBtn, create.isPending && { opacity: 0.7 }]} onPress={startNew} disabled={create.isPending}>
              {create.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>Start Counting</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  name: { fontSize: 14, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 8 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  modalHint: { fontSize: 13, color: Colors.textSecondary },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 8 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: Colors.text, backgroundColor: Colors.background },
  saveBtn: { marginTop: 14, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
