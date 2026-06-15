import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { mobileApi } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { offlineId } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface StockItem { id: string; name: string; currentStock?: number }
interface Line { itemId: string; name: string; quantity: number }

export default function ManageTransferNewScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { businessId, storeId, stores } = useActiveStore();

  const [toStoreId, setToStoreId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const destinations = stores.filter((s) => s.id !== storeId);

  const itemsQ = useQuery<StockItem[]>({
    queryKey: ['transfer-items', businessId, storeId, search],
    queryFn: () => mobileApi.get<StockItem[]>(`/items?businessId=${businessId}&storeId=${storeId}&search=${encodeURIComponent(search)}`),
    enabled: pickerOpen && !!businessId,
    staleTime: 15_000,
  });

  const create = useMutation({
    mutationFn: () =>
      mobileApi.post('/transfers', {
        offlineId: offlineId(),
        businessId,
        fromStoreId: storeId,
        toStoreId,
        initiatedBy: user?.id ?? user?.name ?? 'manager',
        items: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage-transfers'] });
      qc.invalidateQueries({ queryKey: ['manage-stock'] });
      Alert.alert('Created', 'Transfer created and pending approval.');
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.message ?? 'Could not create transfer.'),
  });

  function addLine(item: StockItem) {
    setLines((prev) => prev.some((l) => l.itemId === item.id) ? prev : [...prev, { itemId: item.id, name: item.name, quantity: 1 }]);
    setPickerOpen(false);
    setSearch('');
  }
  function setQty(itemId: string, qty: string) {
    const n = Math.max(1, Number(qty.replace(/[^0-9]/g, '')) || 1);
    setLines((prev) => prev.map((l) => l.itemId === itemId ? { ...l, quantity: n } : l));
  }
  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  function submit() {
    if (!toStoreId) { Alert.alert('Required', 'Choose a destination store.'); return; }
    if (lines.length === 0) { Alert.alert('Required', 'Add at least one item.'); return; }
    create.mutate();
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Transfer</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Destination Store</Text>
        <View style={styles.storeRow}>
          {destinations.length === 0 ? (
            <Text style={styles.muted}>No other store to transfer to.</Text>
          ) : destinations.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeChip, toStoreId === s.id && styles.storeChipActive]}
              onPress={() => setToStoreId(s.id)}
            >
              <Text style={[styles.storeChipText, toStoreId === s.id && { color: '#FFFFFF' }]}>{s.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.itemsHeader}>
          <Text style={styles.sectionTitle}>Items</Text>
          <TouchableOpacity style={styles.addItemBtn} onPress={() => setPickerOpen(true)}>
            <Ionicons name="add" size={16} color={Colors.primary} />
            <Text style={styles.addItemText}>Add item</Text>
          </TouchableOpacity>
        </View>

        {lines.length === 0 ? (
          <Text style={styles.muted}>No items added yet.</Text>
        ) : lines.map((l) => (
          <View key={l.itemId} style={styles.lineCard}>
            <Text style={styles.lineName} numberOfLines={1}>{l.name}</Text>
            <TextInput
              style={styles.qtyInput}
              value={String(l.quantity)}
              onChangeText={(v) => setQty(l.itemId, v)}
              keyboardType="numeric"
            />
            <TouchableOpacity onPress={() => removeLine(l.itemId)}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional note"
          placeholderTextColor={Colors.textSecondary}
          multiline
        />

        <TouchableOpacity style={[styles.saveBtn, create.isPending && { opacity: 0.7 }]} onPress={submit} disabled={create.isPending}>
          {create.isPending ? <ActivityIndicator color="#FFFFFF" /> : (
            <><Ionicons name="checkmark" size={20} color="#FFFFFF" /><Text style={styles.saveBtnText}>Create Transfer</Text></>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Item picker */}
      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Add Item</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
          </View>
          <View style={{ padding: 12 }}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={Colors.textSecondary} />
              <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search items..." placeholderTextColor={Colors.textSecondary} />
            </View>
          </View>
          {itemsQ.isLoading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={itemsQ.data ?? []}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 12, gap: 8 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickRow} onPress={() => addLine(item)}>
                  <Text style={styles.pickName}>{item.name}</Text>
                  <Text style={styles.pickStock}>{item.currentStock ?? 0} in stock</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
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
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  muted: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  storeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storeChip: { borderWidth: 1, borderColor: Colors.border, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  storeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  storeChipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  itemsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addItemText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  qtyInput: {
    width: 60,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 60,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.card,
    textAlignVertical: 'top',
  },
  saveBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    height: 40,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  pickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 14,
  },
  pickName: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1 },
  pickStock: { fontSize: 12, color: Colors.textSecondary },
});
