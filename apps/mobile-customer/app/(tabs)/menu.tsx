import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, formatKES } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';
import { useState, useMemo } from 'react';

interface MenuItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: string;
  barcode?: string;
}

interface PortalCategory {
  name: string;
  items: MenuItem[];
}

interface PortalMenuResponse {
  business: { id?: string; name: string } | null;
  categories: PortalCategory[];
}

function ItemCard({ item }: { item: MenuItem }) {
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const cartItems = useCartStore((s) => s.items);
  const cartItem = cartItems.find((i) => i.id === item.id);
  const qty = cartItem?.quantity ?? 0;

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemIconWrap}>
        <Ionicons name="fast-food" size={28} color={Colors.primary} />
      </View>
      <Text style={styles.itemName} numberOfLines={2}>
        {item.name}
      </Text>
      {item.category ? (
        <Text style={styles.itemCategory}>{item.category}</Text>
      ) : null}
      <Text style={styles.itemPrice}>{formatKES(item.retailPriceCents)}</Text>

      {qty === 0 ? (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() =>
            addItem({
              id: item.id,
              name: item.name,
              retailPriceCents: item.retailPriceCents,
            })
          }
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.qtyRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQty(item.id, qty - 1)}
          >
            <Ionicons name="remove" size={16} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{qty}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQty(item.id, qty + 1)}
          >
            <Ionicons name="add" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function MenuScreen() {
  const businessId = useSessionStore((s) => s.businessId);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery<PortalMenuResponse>({
    queryKey: ['portal-menu', businessId],
    queryFn: () => apiGet(`/portal/menu?businessId=${businessId}`),
    staleTime: 2 * 60 * 1000,
  });

  // Build flat item list from categories, adding category to each item
  const allItems: MenuItem[] = useMemo(() => {
    return (data?.categories ?? []).flatMap((cat) =>
      cat.items.map((item) => ({ ...item, category: cat.name }))
    );
  }, [data]);

  const categoryNames = ['All', ...(data?.categories ?? []).map((c) => c.name)];

  const filteredItems = useMemo(() => {
    let items = selectedCategory === 'All'
      ? allItems
      : allItems.filter((i) => i.category === selectedCategory);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }

    return items;
  }, [allItems, selectedCategory, search]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Menu</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search menu..."
            placeholderTextColor={Colors.textSecondary}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catContent}
      >
        {categoryNames.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.catTab,
              selectedCategory === cat && styles.catTabActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[
                styles.catTabText,
                selectedCategory === cat && styles.catTabTextActive,
              ]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading menu...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="restaurant-outline" size={48} color={Colors.border} />
          <Text style={styles.emptyText}>
            {search ? `No results for "${search}"` : 'No items in this category'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => <ItemCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  refreshBtn: { padding: 4 },
  searchContainer: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    padding: 0,
  },
  catScroll: { maxHeight: 52 },
  catContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.border,
    marginRight: 8,
  },
  catTabActive: { backgroundColor: Colors.primary },
  catTabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  catTabTextActive: { color: '#FFFFFF', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  emptyText: { color: Colors.textSecondary, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  listContent: { padding: 12 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  itemCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  itemIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  itemCategory: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 4,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 20,
    textAlign: 'center',
  },
});
