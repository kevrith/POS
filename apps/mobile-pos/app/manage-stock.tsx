import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { mobileApi, formatKES } from '../lib/api';
import { useActiveStore } from '../lib/useActiveStore';
import { stockStatus, StockStatus } from '../lib/manage-helpers';
import { Colors } from '../constants/theme';

interface StockItem {
  id: string;
  name: string;
  barcode?: string;
  retailPriceCents: number;
  currentStock?: number;
  reorderLevel?: number | null;
  trackStock?: boolean;
  isActive?: boolean;
  category?: { name: string } | null;
}

const STATUS_COLOR: Record<StockStatus, string> = {
  OUT: Colors.error,
  LOW: Colors.warning,
  OK: Colors.success,
};

export default function ManageStockScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { businessId, storeId } = useActiveStore();

  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(params.filter === 'low');

  const { data, isLoading, refetch, isRefetching } = useQuery<StockItem[]>({
    queryKey: ['manage-stock', businessId, storeId, search],
    queryFn: () =>
      mobileApi.get<StockItem[]>(
        `/items?businessId=${businessId}&storeId=${storeId}&search=${encodeURIComponent(search)}`
      ),
    enabled: !!businessId && !!storeId,
    staleTime: 15_000,
  });

  const items = useMemo(() => {
    const list = Array.isArray(data) ? data : [];
    if (!lowOnly) return list;
    return list.filter((i) => stockStatus(i.currentStock ?? 0, i.reorderLevel) !== 'OK');
  }, [data, lowOnly]);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Stock</Text>
          <TouchableOpacity onPress={() => router.push('/manage-item-form')} style={styles.iconBtn}>
            <Ionicons name="add-circle" size={26} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search name or barcode..."
              placeholderTextColor={Colors.textSecondary}
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.scanBtn} onPress={() => router.push('/manage-scan')}>
            <Ionicons name="barcode-outline" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.filterChip, lowOnly && styles.filterChipActive]}
          onPress={() => setLowOnly((v) => !v)}
        >
          <Ionicons name="alert-circle-outline" size={14} color={lowOnly ? '#FFFFFF' : Colors.warning} />
          <Text style={[styles.filterChipText, lowOnly && { color: '#FFFFFF' }]}>Low / Out of stock only</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item }) => {
            const stock = item.currentStock ?? 0;
            const status = stockStatus(stock, item.reorderLevel);
            return (
              <TouchableOpacity
                style={styles.itemCard}
                activeOpacity={0.8}
                onPress={() => router.push(`/manage-item?id=${item.id}`)}
              >
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemSub}>
                    {item.category?.name ? `${item.category.name} · ` : ''}{formatKES(item.retailPriceCents)}
                  </Text>
                </View>
                <View style={styles.stockWrap}>
                  {item.trackStock === false ? (
                    <Text style={styles.noTrack}>Not tracked</Text>
                  ) : (
                    <>
                      <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
                      <Text style={[styles.stockValue, { color: STATUS_COLOR[status] }]}>{stock}</Text>
                    </>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.border} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>{lowOnly ? 'Nothing low on stock' : 'No items found'}</Text>
              <TouchableOpacity style={styles.addEmptyBtn} onPress={() => router.push('/manage-item-form')}>
                <Text style={styles.addEmptyText}>Add Item</Text>
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
    backgroundColor: Colors.card,
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { padding: 4, minWidth: 34 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },
  scanBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.warning,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterChipActive: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.warning },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  addEmptyBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addEmptyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  itemCard: {
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
  itemInfo: { flex: 1, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  itemSub: { fontSize: 12, color: Colors.textSecondary },
  stockWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  stockValue: { fontSize: 16, fontWeight: '800' },
  noTrack: { fontSize: 11, color: Colors.textSecondary, fontStyle: 'italic' },
});
