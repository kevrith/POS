import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { countVariance } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface Count {
  id: string;
  itemName: string;
  systemQty: number;
  countedQty: number | null;
  varianceQty: number | null;
}
interface SessionDetail {
  id: string;
  name: string;
  status: string;
  counts: Count[];
}

export default function StocktakeSessionScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery<SessionDetail>({
    queryKey: ['stocktake-session', id],
    queryFn: () => mobileApi.get<SessionDetail>(`/stocktake/sessions/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!data) return;
    const initial: Record<string, string> = {};
    for (const c of data.counts) {
      if (c.countedQty != null) initial[c.id] = String(c.countedQty);
    }
    setEdits(initial);
  }, [data?.id]);

  const finalized = data?.status === 'FINALIZED';

  const save = useMutation({
    mutationFn: () => {
      const updates = Object.entries(edits)
        .filter(([, v]) => v.trim() !== '')
        .map(([countId, v]) => ({ countId, countedQty: Number(v), countedBy: user?.id ?? user?.name ?? 'manager' }));
      return mobileApi.patch(`/stocktake/sessions/${id}/counts`, { updates });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktake-session', id] });
      qc.invalidateQueries({ queryKey: ['stocktake-sessions'] });
      Alert.alert('Saved', 'Counts saved.');
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Could not save counts.'),
  });

  const finalize = useMutation({
    mutationFn: () => mobileApi.post(`/stocktake/sessions/${id}/finalize`, { finalizedBy: user?.id ?? user?.name ?? 'manager' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktake-session', id] });
      qc.invalidateQueries({ queryKey: ['stocktake-sessions'] });
      qc.invalidateQueries({ queryKey: ['manage-stock'] });
      Alert.alert('Finalized', 'Stock adjusted to match your counts.');
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Could not finalize.'),
  });

  function confirmFinalize() {
    Alert.alert('Finalize stock take', 'This adjusts every item to its counted quantity and locks the session. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Finalize', style: 'destructive', onPress: () => finalize.mutate() },
    ]);
  }

  if (isLoading || !data) {
    return (
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{data.name}</Text>
        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.legend}>
          <Text style={styles.legendCol}>Item</Text>
          <Text style={styles.legendSmall}>System</Text>
          <Text style={styles.legendSmall}>Counted</Text>
          <Text style={styles.legendSmall}>Var</Text>
        </View>
        <FlatList
          data={data.counts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: c }) => {
            const typed = edits[c.id];
            const counted = typed != null && typed !== '' ? Number(typed) : null;
            const variance = counted != null ? countVariance(c.systemQty, counted) : null;
            return (
              <View style={styles.row}>
                <Text style={styles.rowName} numberOfLines={2}>{c.itemName}</Text>
                <Text style={styles.rowSystem}>{c.systemQty}</Text>
                <TextInput
                  style={[styles.rowInput, finalized && styles.rowInputDisabled]}
                  value={typed ?? ''}
                  onChangeText={(v) => setEdits((e) => ({ ...e, [c.id]: v.replace(/[^0-9]/g, '') }))}
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor={Colors.textSecondary}
                  editable={!finalized}
                />
                <Text style={[styles.rowVar, variance != null && variance !== 0 && { color: variance < 0 ? Colors.error : Colors.success }]}>
                  {variance == null ? '—' : variance > 0 ? `+${variance}` : variance}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No tracked items in this store.</Text>}
        />

        {!finalized && (
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.footerBtn, styles.saveBtn]} onPress={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <ActivityIndicator color={Colors.primary} /> : (
                <><Ionicons name="save-outline" size={18} color={Colors.primary} /><Text style={styles.saveText}>Save</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerBtn, styles.finalizeBtn]} onPress={confirmFinalize} disabled={finalize.isPending}>
              {finalize.isPending ? <ActivityIndicator color="#FFFFFF" /> : (
                <><Ionicons name="checkmark-done" size={18} color="#FFFFFF" /><Text style={styles.finalizeText}>Finalize</Text></>
              )}
            </TouchableOpacity>
          </View>
        )}
        {finalized && (
          <View style={styles.finalizedBanner}>
            <Ionicons name="lock-closed" size={16} color={Colors.success} />
            <Text style={styles.finalizedText}>Finalized — stock has been adjusted</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 8,
  },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.background },
  legendCol: { flex: 1, fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  legendSmall: { width: 58, textAlign: 'center', fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  list: { paddingHorizontal: 12, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
    gap: 4,
  },
  rowName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text },
  rowSystem: { width: 58, textAlign: 'center', fontSize: 14, color: Colors.textSecondary },
  rowInput: {
    width: 58,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  rowInputDisabled: { borderColor: Colors.border, color: Colors.textSecondary },
  rowVar: { width: 58, textAlign: 'center', fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  emptyText: { textAlign: 'center', color: Colors.textSecondary, marginTop: 40 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.card },
  footerBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 13, borderRadius: 12 },
  saveBtn: { borderWidth: 1.5, borderColor: Colors.primary },
  saveText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  finalizeBtn: { backgroundColor: Colors.success },
  finalizeText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  finalizedBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 16, backgroundColor: Colors.success + '12' },
  finalizedText: { color: Colors.success, fontSize: 13, fontWeight: '600' },
});
