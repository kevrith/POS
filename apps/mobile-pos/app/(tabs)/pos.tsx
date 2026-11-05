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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { usePosMode } from '../../lib/usePosMode';
import { useCartStore } from '../../stores/cart';
import { overrideAllowed } from '../../lib/checkoutLines';
import { useHeldSalesStore } from '../../stores/heldSales';
import { Colors } from '../../constants/theme';
import CustomerPickerModal from '../../components/CustomerPickerModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  name: string;
  barcode?: string;
  sku?: string;
  category?: { name?: string } | string | null;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  currentStock?: number;
  trackStock?: boolean;
  batches?: Array<{ lotNumber: string; expiryDate?: string; quantity: number }>;
}

interface Promotion {
  id: string;
  name: string;
  type: string;
  value: number;
  minOrderCents?: number;
}

type PriceLevel = 'RETAIL' | 'WHOLESALE' | 'VIP';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getItemPrice(item: Item, level: PriceLevel): number {
  if (level === 'WHOLESALE' && item.wholesalePriceCents) return item.wholesalePriceCents;
  if (level === 'VIP' && item.vipPriceCents) return item.vipPriceCents;
  return item.retailPriceCents;
}

function categoryName(item: Item): string | undefined {
  if (!item.category) return undefined;
  return typeof item.category === 'string' ? item.category : item.category.name;
}

function daysUntil(dateStr: string): number | null {
  try {
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function calcPromoDiscount(promo: Promotion, subtotal: number): number {
  if (promo.minOrderCents && subtotal < promo.minOrderCents) return 0;
  if (promo.type === 'PERCENTAGE') return Math.round((subtotal * promo.value) / 100);
  if (promo.type === 'FIXED_AMOUNT') return Math.min(promo.value, subtotal);
  return 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function POSScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { businessId, storeId } = useActiveStore();
  const { can } = usePosMode();
  const hasDineIn = can('tables');

  const {
    items: cartItems,
    addItem,
    restoreItems,
    updateQty,
    updateItemDiscount,
    overrideItemPrice,
    removeItem,
    clearCart,
    subtotalCents,
    promoDiscountCents,
    priceLevel,
    setPriceLevel,
    customerId,
    customerName,
    setCustomer,
    fefoAlerts,
    setFEFOAlerts,
    appliedPromotion,
    setPromotion,
  } = useCartStore();

  const { held, hold, resume, discard } = useHeldSalesStore();

  // UI state
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCart, setShowCart] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showHeld, setShowHeld] = useState(false);

  // Per-item editing state (inside cart modal)
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState('');
  const [showPriceOverride, setShowPriceOverride] = useState<string | null>(null);
  const [priceOverrideInput, setPriceOverrideInput] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: itemsData, isLoading } = useQuery<Item[]>({
    queryKey: ['items', businessId, storeId],
    queryFn: () => mobileApi.get<Item[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: promotions = [] } = useQuery<Promotion[]>({
    queryKey: ['promotions-active', businessId],
    queryFn: () => mobileApi.get<Promotion[]>(`/promotions?businessId=${businessId}&active=true`),
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000,
  });

  // Save-as-invoice mutation
  const { mutate: saveAsInvoice, isPending: savingInvoice } = useMutation({
    mutationFn: () =>
      mobileApi.post<{ id: string; receiptNumber?: string }>('/sales/proformas', {
        businessId,
        customerName: customerName ?? 'Walk-in',
        items: cartItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          discountPercent: 0, // unitPriceCents already carries any per-item discount
        })),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['proformas'] });
      Alert.alert('Saved', `Proforma invoice #${res.receiptNumber ?? res.id} created.`);
      clearCart();
      setShowCart(false);
    },
    onError: (err: any) =>
      Alert.alert('Error', err?.message ?? 'Could not save invoice.'),
  });

  // ── Derived data ───────────────────────────────────────────────────────────

  const items = itemsData ?? [];

  const categories = useMemo(() => {
    const cats = new Set(items.map(categoryName).filter(Boolean) as string[]);
    return ['All', ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedCategory !== 'All')
      result = result.filter((i) => categoryName(i) === selectedCategory);
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

  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = subtotalCents();
  const promoDiscount = promoDiscountCents();
  const grandTotal = Math.max(0, subtotal - promoDiscount);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleAddItem(item: Item) {
    const price = getItemPrice(item, priceLevel);
    addItem({ id: item.id, name: item.name, unitPriceCents: price, barcode: item.barcode });

    // FEFO: check if this item has batches expiring within 30 days
    if (item.batches?.length) {
      const soon = item.batches
        .filter((b) => b.expiryDate)
        .map((b) => ({ ...b, days: daysUntil(b.expiryDate!) }))
        .filter((b) => b.days !== null && b.days <= 30)
        .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

      if (soon.length > 0) {
        const existing = fefoAlerts.filter((a) => a.itemId !== item.id);
        setFEFOAlerts([
          ...existing,
          { itemId: item.id, itemName: item.name, lotNumber: soon[0].lotNumber, daysLeft: soon[0].days },
        ]);
      }
    }

    // Auto-apply best matching promotion
    const newSubtotal = subtotal + price;
    const best = promotions
      .map((p) => ({ p, disc: calcPromoDiscount(p, newSubtotal) }))
      .filter((x) => x.disc > 0)
      .sort((a, b) => b.disc - a.disc)[0];
    setPromotion(best ? { id: best.p.id, name: best.p.name, discountCents: best.disc } : null);
  }

  function handleHold() {
    if (cartItems.length === 0) return;
    hold({ items: cartItems, priceLevel, customerId, customerName, appliedPromotion });
    clearCart();
    Alert.alert('Sale Held', 'Cart saved. Tap the held sales button to resume.');
  }

  function handleResume(id: string) {
    const sale = resume(id);
    if (!sale) return;
    clearCart();
    restoreItems(sale.items);
    setCustomer(sale.customerId, sale.customerName);
    if (sale.appliedPromotion) setPromotion(sale.appliedPromotion);
    setShowHeld(false);
  }

  function commitDiscountEdit(itemId: string) {
    const pct = Math.min(100, Math.max(0, parseFloat(discountInput) || 0));
    updateItemDiscount(itemId, pct);
    setEditingDiscountId(null);
    setDiscountInput('');
  }

  function commitPriceOverride(itemId: string) {
    const cents = Math.round((parseFloat(priceOverrideInput) || 0) * 100);
    const listPrice = cartItems.find((i) => i.id === itemId)?.catalogPriceCents ?? 0;
    if (cents > 0 && !overrideAllowed(cents, listPrice)) {
      // The server charges the catalog price, so a higher price on screen would be a lie at the till.
      Alert.alert('Price too high', `A price cannot be raised above the list price (${formatKES(listPrice)}).`);
      return;
    }
    if (cents > 0) overrideItemPrice(itemId, cents);
    setShowPriceOverride(null);
    setPriceOverrideInput('');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>

      {/* ── Header ── */}
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
              <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/barcode-scan' as any)} accessibilityRole="button" accessibilityLabel="Scan" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="scan" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: Colors.indigo }]} onPress={() => setShowCustomerPicker(true)}>
            <Ionicons name="person" size={20} color="#FFFFFF" />
          </TouchableOpacity>
          {/* Dine-in floor. Waiters never see the Manage tab, so the table
              picker has to hang off the POS screen for them. */}
          {hasDineIn && (
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: '#F97316' }]} onPress={() => router.push('/manage-tables' as any)}>
              <Ionicons name="grid" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Customer chip */}
        {customerName ? (
          <View style={styles.customerChip}>
            <Ionicons name="person-circle" size={14} color={Colors.primary} />
            <Text style={styles.customerChipText} numberOfLines={1}>{customerName}</Text>
            <TouchableOpacity onPress={() => setCustomer(null, null)} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={14} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Price level + held sales row */}
        <View style={styles.pillRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
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

          {/* Hold button */}
          <TouchableOpacity
            style={[styles.holdBtn, cartItems.length === 0 && { opacity: 0.35 }]}
            onPress={handleHold}
            disabled={cartItems.length === 0}
          >
            <Ionicons name="pause-circle" size={18} color={Colors.warning} />
            <Text style={styles.holdBtnText}>Hold</Text>
          </TouchableOpacity>

          {/* Held sales badge */}
          {held.length > 0 && (
            <TouchableOpacity style={styles.heldBadge} onPress={() => setShowHeld(true)}>
              <Ionicons name="play-circle" size={18} color={Colors.success} />
              <Text style={styles.heldBadgeText}>{held.length}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── FEFO banner ── */}
      {fefoAlerts.length > 0 && (
        <View style={styles.fefoBar}>
          <Ionicons name="warning" size={14} color="#92400E" />
          <Text style={styles.fefoText} numberOfLines={1}>
            FEFO: {fefoAlerts[0].itemName} — Lot {fefoAlerts[0].lotNumber}
            {fefoAlerts[0].daysLeft !== null ? ` expires in ${fefoAlerts[0].daysLeft}d` : ''}
            {fefoAlerts.length > 1 ? ` +${fefoAlerts.length - 1} more` : ''}
          </Text>
        </View>
      )}

      {/* ── Promotion banner ── */}
      {appliedPromotion && (
        <View style={styles.promoBar}>
          <Ionicons name="pricetag" size={14} color="#065F46" />
          <Text style={styles.promoText} numberOfLines={1}>
            {appliedPromotion.name} — -{formatKES(appliedPromotion.discountCents)}
          </Text>
          <TouchableOpacity onPress={() => setPromotion(null)} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={14} color="#065F46" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Category tabs ── */}
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
            <Text style={[styles.catTabText, selectedCategory === cat && styles.catTabTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Items grid ── */}
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
            const outOfStock = !!item.trackStock && (item.currentStock ?? 0) <= 0;
            return (
              <View style={styles.itemCard}>
                <View style={styles.itemIconWrap}>
                  <Ionicons name="cube" size={24} color={Colors.primary} />
                </View>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {item.trackStock ? (
                  <Text style={[styles.stockText, outOfStock && { color: Colors.error }]}>
                    Stock: {item.currentStock ?? 0}
                  </Text>
                ) : null}
                <Text style={styles.itemPrice}>{formatKES(price)}</Text>
                {qty === 0 ? (
                  <TouchableOpacity
                    style={[styles.addBtn, outOfStock && styles.addBtnDisabled]}
                    onPress={() => handleAddItem(item)}
                    disabled={outOfStock}
                  >
                    <Ionicons name="add" size={16} color="#FFFFFF" />
                    <Text style={styles.addBtnText}>Add</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, qty - 1)} accessibilityRole="button" accessibilityLabel="Decrease" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="remove" size={14} color={Colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyText}>{qty}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, qty + 1)} accessibilityRole="button" accessibilityLabel="Add" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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

      {/* ── Cart FAB ── */}
      {cartCount > 0 && (
        <TouchableOpacity style={styles.cartFab} onPress={() => setShowCart(true)} activeOpacity={0.85}>
          <Ionicons name="cart" size={22} color="#FFFFFF" />
          <Text style={styles.cartFabText}>{cartCount} items</Text>
          <Text style={styles.cartFabTotal}>{formatKES(grandTotal)}</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ── Cart Modal ── */}
      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Cart ({cartCount})</Text>
              {customerName ? (
                <Text style={styles.modalSub}>{customerName}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setShowCart(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* FEFO alert inside cart */}
          {fefoAlerts.length > 0 && (
            <View style={styles.fefoCartBanner}>
              <Ionicons name="warning" size={16} color="#92400E" />
              <View style={{ flex: 1 }}>
                <Text style={styles.fefoCartTitle}>FEFO — sell by expiry first:</Text>
                {fefoAlerts.slice(0, 3).map((a) => (
                  <Text key={a.itemId} style={styles.fefoCartLine}>
                    {a.itemName}: Lot {a.lotNumber}
                    {a.daysLeft !== null ? ` — ${a.daysLeft}d left` : ''}
                  </Text>
                ))}
              </View>
            </View>
          )}

          <FlatList
            data={cartItems}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            renderItem={({ item }) => (
              <View style={styles.cartCard}>
                {/* Name + remove */}
                <View style={styles.cartCardHeader}>
                  <Text style={styles.cartItemName} numberOfLines={2}>{item.name}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.id)} accessibilityRole="button" accessibilityLabel="Delete" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>

                {/* Unit price (show original if overridden) */}
                <Text style={styles.cartUnitPrice}>
                  {formatKES(item.unitPriceCents)} each
                  {item.originalPriceCents !== item.unitPriceCents ? (
                    <Text style={styles.originalPrice}> (was {formatKES(item.originalPriceCents)})</Text>
                  ) : null}
                  {item.discountPercent > 0 ? (
                    <Text style={styles.discountBadge}> -{item.discountPercent}%</Text>
                  ) : null}
                </Text>

                {/* Qty controls + line total */}
                <View style={styles.cartControls}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantity - 1)} accessibilityRole="button" accessibilityLabel="Decrease" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="remove" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(item.id, item.quantity + 1)} accessibilityRole="button" accessibilityLabel="Add" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Ionicons name="add" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.cartLineTotal}>
                    {formatKES(item.unitPriceCents * item.quantity)}
                  </Text>
                </View>

                {/* Per-item discount row */}
                <View style={styles.cartEditRow}>
                  {editingDiscountId === item.id ? (
                    <View style={styles.inlineInputWrap}>
                      <TextInput
                        style={styles.inlineInput}
                        value={discountInput}
                        onChangeText={setDiscountInput}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={Colors.textSecondary}
                        autoFocus
                      />
                      <Text style={styles.inlineInputSuffix}>%</Text>
                      <TouchableOpacity style={styles.inlineConfirm} onPress={() => commitDiscountEdit(item.id)} accessibilityRole="button" accessibilityLabel="Confirm" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingDiscountId(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.editChip}
                      onPress={() => {
                        setEditingDiscountId(item.id);
                        setDiscountInput(item.discountPercent > 0 ? String(item.discountPercent) : '');
                      }}
                    >
                      <Ionicons name="pricetag-outline" size={12} color={Colors.textSecondary} />
                      <Text style={styles.editChipText}>
                        {item.discountPercent > 0 ? `${item.discountPercent}% off` : 'Discount'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {showPriceOverride === item.id ? (
                    <View style={styles.inlineInputWrap}>
                      <TextInput
                        style={styles.inlineInput}
                        value={priceOverrideInput}
                        onChangeText={setPriceOverrideInput}
                        keyboardType="decimal-pad"
                        placeholder="New price"
                        placeholderTextColor={Colors.textSecondary}
                        autoFocus
                      />
                      <Text style={styles.inlineInputSuffix}>KES</Text>
                      <TouchableOpacity style={styles.inlineConfirm} onPress={() => commitPriceOverride(item.id)} accessibilityRole="button" accessibilityLabel="Confirm" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setShowPriceOverride(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.editChip}
                      onPress={() => {
                        setShowPriceOverride(item.id);
                        setPriceOverrideInput((item.unitPriceCents / 100).toFixed(2));
                      }}
                    >
                      <Ionicons name="create-outline" size={12} color={Colors.textSecondary} />
                      <Text style={styles.editChipText}>Override price</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />

          {/* Cart summary + actions */}
          <View style={styles.cartSummary}>
            <View style={styles.cartSummaryRow}>
              <Text style={styles.cartSummaryLabel}>Subtotal</Text>
              <Text style={styles.cartSummaryValue}>{formatKES(subtotal)}</Text>
            </View>
            {appliedPromotion && promoDiscount > 0 && (
              <View style={styles.cartSummaryRow}>
                <Text style={[styles.cartSummaryLabel, { color: Colors.success }]}>
                  {appliedPromotion.name}
                </Text>
                <Text style={[styles.cartSummaryValue, { color: Colors.success }]}>
                  -{formatKES(promoDiscount)}
                </Text>
              </View>
            )}
            <View style={[styles.cartSummaryRow, { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8 }]}>
              <Text style={[styles.cartSummaryLabel, { fontWeight: '700', color: Colors.text }]}>Total</Text>
              <Text style={[styles.cartSummaryValue, { fontSize: 20, color: Colors.primary }]}>
                {formatKES(grandTotal)}
              </Text>
            </View>

            {/* Save as invoice */}
            <TouchableOpacity
              style={[styles.invoiceBtn, (cartItems.length === 0 || savingInvoice) && { opacity: 0.4 }]}
              onPress={() => saveAsInvoice()}
              disabled={cartItems.length === 0 || savingInvoice}
            >
              {savingInvoice ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={18} color={Colors.primary} />
                  <Text style={styles.invoiceBtnText}>Save as Invoice / Proforma</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkoutBtn}
              onPress={() => { setShowCart(false); router.push('/payment' as any); }}
            >
              <Ionicons name="card" size={20} color="#FFFFFF" />
              <Text style={styles.checkoutBtnText}>Checkout · {formatKES(grandTotal)}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* ── Held Sales Modal ── */}
      <Modal visible={showHeld} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Held Sales ({held.length}/10)</Text>
            <TouchableOpacity onPress={() => setShowHeld(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={held}
            keyExtractor={(h) => h.id}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="pause-circle-outline" size={48} color={Colors.border} />
                <Text style={styles.emptyText}>No held sales</Text>
              </View>
            }
            renderItem={({ item: h }) => {
              const total = h.items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
              const time = new Date(h.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
              return (
                <View style={styles.heldCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heldLabel}>{h.label}</Text>
                    <Text style={styles.heldMeta}>
                      {time} · {h.items.length} items · {h.priceLevel}
                    </Text>
                    <Text style={styles.heldItems} numberOfLines={1}>
                      {h.items.map((i) => i.name).join(', ')}
                    </Text>
                  </View>
                  <Text style={styles.heldTotal}>{formatKES(total)}</Text>
                  <View style={styles.heldActions}>
                    <TouchableOpacity style={styles.resumeBtn} onPress={() => handleResume(h.id)}>
                      <Ionicons name="play" size={14} color="#FFFFFF" />
                      <Text style={styles.resumeBtnText}>Resume</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.discardBtn} onPress={() => discard(h.id)} accessibilityRole="button" accessibilityLabel="Delete" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="trash" size={14} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Customer Picker ── */}
      <CustomerPickerModal
        visible={showCustomerPicker}
        businessId={businessId}
        onSelect={(id, name) => {
          if (id) setCustomer(id, name);
          else setCustomer(null, null);
        }}
        onClose={() => setShowCustomerPicker(false)}
      />

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: { backgroundColor: Colors.card, padding: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 12, gap: 8, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  iconBtn: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  customerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary + '12', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  customerChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600', maxWidth: 160 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18,
    borderWidth: 1, borderColor: Colors.border, marginRight: 8, backgroundColor: Colors.background,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '700' },
  holdBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.warning + '60',
    backgroundColor: Colors.warning + '12',
  },
  holdBtnText: { fontSize: 12, color: Colors.warning, fontWeight: '600' },
  heldBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.success + '60',
    backgroundColor: Colors.success + '12',
  },
  heldBadgeText: { fontSize: 12, color: Colors.success, fontWeight: '700' },

  // Banners
  fefoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  fefoText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '500' },
  promoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#D1FAE5', paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#A7F3D0',
  },
  promoText: { flex: 1, fontSize: 12, color: '#065F46', fontWeight: '600' },

  // Category tabs
  catScroll: { maxHeight: 48, backgroundColor: Colors.card },
  catContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, alignItems: 'center' },
  catTab: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, marginRight: 8,
  },
  catTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catTabText: { fontSize: 12, color: Colors.textSecondary },
  catTabTextActive: { color: '#FFFFFF', fontWeight: '600' },

  // Item grid
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 40 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  grid: { padding: 10, paddingBottom: 100 },
  columnWrapper: { gap: 10, marginBottom: 10 },
  itemCard: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 12, padding: 12,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  itemIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  itemName: { fontSize: 12, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  stockText: { fontSize: 11, color: Colors.textSecondary },
  itemPrice: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, gap: 4, marginTop: 4,
  },
  addBtnDisabled: { backgroundColor: Colors.border },
  addBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  qtyBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1.5, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  qtyText: { fontSize: 14, fontWeight: '700', color: Colors.text, minWidth: 18, textAlign: 'center' },

  // Cart FAB
  cartFab: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: Colors.primary, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14, gap: 8,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  cartFabText: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cartFabTotal: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Modal shared
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.card,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  modalSub: { fontSize: 12, color: Colors.primary, marginTop: 1 },

  // FEFO inside cart
  fefoCartBanner: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FEF3C7', padding: 12,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  fefoCartTitle: { fontSize: 12, fontWeight: '700', color: '#92400E' },
  fefoCartLine: { fontSize: 11, color: '#92400E', marginTop: 2 },

  // Cart item card
  cartCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 12, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cartCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cartItemName: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text, marginRight: 8 },
  cartUnitPrice: { fontSize: 11, color: Colors.textSecondary },
  originalPrice: { color: Colors.error, textDecorationLine: 'line-through' },
  discountBadge: { color: Colors.success, fontWeight: '700' },
  cartControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartLineTotal: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: Colors.primary },
  cartEditRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  editChipText: { fontSize: 11, color: Colors.textSecondary },
  inlineInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  inlineInput: {
    flex: 1, height: 30, borderWidth: 1, borderColor: Colors.primary,
    borderRadius: 6, paddingHorizontal: 8, fontSize: 13, color: Colors.text,
    backgroundColor: Colors.background,
  },
  inlineInputSuffix: { fontSize: 12, color: Colors.textSecondary },
  inlineConfirm: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },

  // Cart summary
  cartSummary: {
    backgroundColor: Colors.card, padding: 16,
    borderTopWidth: 1, borderTopColor: Colors.border, gap: 8,
  },
  cartSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartSummaryLabel: { fontSize: 14, color: Colors.textSecondary },
  cartSummaryValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
  invoiceBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.primary, backgroundColor: Colors.primary + '08',
  },
  invoiceBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  checkoutBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  checkoutBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Held sales
  heldCard: {
    backgroundColor: Colors.card, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  heldLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  heldMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  heldItems: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  heldTotal: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  heldActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  resumeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  resumeBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  discardBtn: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.error + '40',
    backgroundColor: Colors.error + '10', justifyContent: 'center', alignItems: 'center',
  },
});
