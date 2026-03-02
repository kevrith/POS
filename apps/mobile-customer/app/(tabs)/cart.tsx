import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';
import { formatKES } from '../../lib/api';
import { useState } from 'react';

type OrderType = 'DELIVERY' | 'PICKUP';

export default function CartScreen() {
  const router = useRouter();
  const { items, updateQty, removeItem, totalCents } = useCartStore();
  const [orderType, setOrderType] = useState<OrderType>('DELIVERY');

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Cart</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={72} color={Colors.border} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySubtitle}>
            Add items from the menu to get started
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => router.push('/(tabs)/menu' as any)}
            activeOpacity={0.8}
          >
            <Ionicons name="restaurant" size={18} color="#FFFFFF" />
            <Text style={styles.browseBtnText}>Browse Menu</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Cart</Text>
        <Text style={styles.itemCount}>{items.length} item(s)</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.itemUnitPrice}>
                {formatKES(item.retailPriceCents)} each
              </Text>
            </View>
            <View style={styles.itemControls}>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQty(item.id, item.quantity - 1)}
                >
                  <Ionicons name="remove" size={16} color={Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQty(item.id, item.quantity + 1)}
                >
                  <Ionicons name="add" size={16} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.lineTotal}>
                {formatKES(item.retailPriceCents * item.quantity)}
              </Text>
              <TouchableOpacity
                onPress={() => removeItem(item.id)}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListFooterComponent={
          <View>
            {/* Order type toggle */}
            <Text style={styles.sectionLabel}>Order Type</Text>
            <View style={styles.toggleRow}>
              {(['DELIVERY', 'PICKUP'] as OrderType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.toggleBtn,
                    orderType === type && styles.toggleBtnActive,
                  ]}
                  onPress={() => setOrderType(type)}
                >
                  <Ionicons
                    name={type === 'DELIVERY' ? 'bicycle' : 'bag-check'}
                    size={16}
                    color={orderType === type ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.toggleBtnText,
                      orderType === type && styles.toggleBtnTextActive,
                    ]}
                  >
                    {type === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
      />

      {/* Bottom summary */}
      <View style={styles.summary}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{formatKES(totalCents())}</Text>
        </View>
        <TouchableOpacity
          style={styles.checkoutBtn}
          onPress={() =>
            router.push({ pathname: '/checkout', params: { orderType } } as any)
          }
          activeOpacity={0.85}
        >
          <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
          <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
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
  itemCount: { fontSize: 13, color: Colors.textSecondary },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
    marginTop: 8,
  },
  browseBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  listContent: { padding: 16, paddingBottom: 8 },
  cartItem: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 4 },
  itemUnitPrice: { fontSize: 12, color: Colors.textSecondary },
  itemControls: { alignItems: 'flex-end', gap: 6 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 18,
    textAlign: 'center',
  },
  lineTotal: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  deleteBtn: { padding: 2 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  toggleBtnTextActive: { color: '#FFFFFF', fontWeight: '600' },
  summary: {
    backgroundColor: Colors.card,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 12,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subtotalLabel: { fontSize: 15, color: Colors.textSecondary },
  subtotalValue: { fontSize: 18, fontWeight: '700', color: Colors.text },
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
