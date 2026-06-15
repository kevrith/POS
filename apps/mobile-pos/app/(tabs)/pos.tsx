import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';

interface Item {
  id: string;
  name: string;
  barcode?: string;
  sku?: string;
  // The API returns category as an object ({ id, name, color }) or null.
  category?: { name?: string } | string | null;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  currentStock?: number;
  trackStock?: boolean;
}

type PriceLevel = 'RETAIL' | 'WHOLESALE' | 'VIP';

function getItemPrice(item: Item, level: PriceLevel): number {
  if (level === 'WHOLESALE' && item.wholesalePriceCents) return item.wholesalePriceCents;
  if (level === 'VIP' && item.vipPriceCents) return item.vipPriceCents;
  return item.retailPriceCents;
}

function categoryName(item: Item): string | undefined {
  if (!item.category) return undefined;
  return typeof item.category === 'string' ? item.category : item.category.name;
}

export default function POSScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { items: cartItems, addItem, updateQty, subtotalCents, priceLevel, setPriceLevel } = useCartStore();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCart, setShowCart] = useState(false);

  const { businessId, storeId } = useActiveStore();

  const { data: itemsData, isLoading } = useQuery<Item[]>({
    queryKey: ['items', businessId, storeId],
    queryFn: () =>
      mobileApi.get<Item[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const items = itemsData ?? [];

  const categories = useMemo(() => {
    const cats = new Set(items.map(categoryName).filter(Boolean) as string[]);
    return ['All', ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'All') {
      result = result.filter((i) => categoryName(i) === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.barcode ?? '').includes(q) ||
          (i.sku ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, selectedCategory, search]);

  function handleAddItem(item: Item) {
    const price = getItemPrice(item, priceLevel);
    addItem({ id: item.id, name: item.name, unitPriceCents: price });
  }

  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search items or barcode..."
              placeholderTextColor={Colors.textSecondary}
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={() => router.push('/barcode-scan' as any)}
          >
            <Ionicons name="scan" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Price Level */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
          {(['RETAIL', 'WHOLESALE', 'VIP'] as PriceLevel[]).map((level) => (
            <TouchableOpacity
              key={level}
              style={[styles.pill, priceLevel === level && styles.pillActive]}
              onPress={() => setPriceLevel(level)}
            >
              <Text style={[styles.pillText, priceLevel === level && styles.pillTextActive]}>
                {level}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.catScroll}
        contentContainerStyle={styles.catContent}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catTab, selectedCategory === cat && styles.catTabActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text
              style={[styles.catTabText, selectedCategory === cat && styles.catTabTextActive]}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Items Grid */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => {
            const price = getItemPrice(item, priceLevel);
            const cartItem = cartItems.find((c) => c.id === item.id);
            const qty = cartItem?.quantity ?? 0;
            return (
              <View style={styles.itemCard}>
                <View style={styles.itemIconWrap}>
                  <Ionicons name="cube" size={24} color={Colors.primary} />
                </View>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {item.trackStock ? (
                  <Text style={[styles.stockText, (item.currentStock ?? 0) <= 0 && { color: Colors.error }]}>
                    Stock: {item.currentStock ?? 0}
                  </Text>
                ) : null}
                <Text style={styles.itemPrice}>{formatKES(price)}</Text>
                {qty === 0 ? (
                  <TouchableOpacity
                    style={[styles.addBtn, item.trackStock && (item.currentStock ?? 0) <= 0 && styles.addBtnDisabled]}
                    onPress={() => handleAddItem(item)}
                    disabled={item.trackStock && (item.currentStock ?? 0) <= 0}
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
                      <Ionicons name="remove" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQty(item.id, qty + 1)}
                    >
                      <Ionicons name="add" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No items found</Text>
            </View>
          }
        />
      )}

      {/* Cart FAB */}
      {cartCount > 0 && (
        <TouchableOpacity
          style={styles.cartFab}
          onPress={() => setShowCart(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="cart" size={22} color="#FFFFFF" />
          <Text style={styles.cartFabText}>{cartCount} items</Text>
          <Text style={styles.cartFabTotal}>{formatKES(subtotalCents())}</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Cart Modal */}
      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Cart ({cartCount})</Text>
            <TouchableOpacity onPress={() => setShowCart(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={cartItems}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                <View style={styles.cartControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQty(item.id, item.quantity - 1)}
                  >
                    <Ionicons name="remove" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateQty(item.id, item.quantity + 1)}
                  >
                    <Ionicons name="add" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.cartItemTotal}>
                    {formatKES(item.unitPriceCents * item.quantity)}
                  </Text>
                </View>
              </View>
            )}
          />
          <View style={styles.cartSummary}>
            <View style={styles.cartSummaryRow}>
              <Text style={styles.cartSummaryLabel}>Subtotal</Text>
              <Text style={styles.cartSummaryValue}>{formatKES(subtotalCents())}</Text>
            </View>
            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => {
                setShowCart(false);
                router.push('/payment' as any);
              }}
            >
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.checkoutBtnText}>Checkout</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.card, padding: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  scanBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillRow: { maxHeight: 36 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    backgroundColor: Colors.background,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '700' },
  catScroll: { maxHeight: 48, backgroundColor: Colors.card },
  catContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  catTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catTabText: { fontSize: 12, color: Colors.textSecondary },
  catTabTextActive: { color: '#FFFFFF', fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 40 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  grid: { padding: 10, paddingBottom: 100 },
  columnWrapper: { gap: 10, marginBottom: 10 },
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
    gap: 4,
  },
  itemIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  stockText: { fontSize: 11, color: Colors.textSecondary },
  itemPrice: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
    marginTop: 4,
  },
  addBtnDisabled: { backgroundColor: Colors.border },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '700', color: Colors.text, minWidth: 18, textAlign: 'center' },
  cartFab: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  cartFabText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cartFabTotal: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  cartRow: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartItemName: { flex: 1, fontSize: 13, color: Colors.text, marginRight: 8 },
  cartControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartItemTotal: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginLeft: 6 },
  cartSummary: {
    backgroundColor: Colors.card,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  cartSummaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cartSummaryLabel: { fontSize: 15, color: Colors.textSecondary },
  cartSummaryValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
  checkoutBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  checkoutBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
