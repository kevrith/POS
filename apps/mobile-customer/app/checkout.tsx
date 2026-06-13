import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { apiPost, formatKES } from '../lib/api';
import { useCartStore } from '../stores/cart';
import { useSessionStore } from '../stores/session';
import { Colors } from '../constants/theme';

type OrderType = 'DELIVERY' | 'PICKUP';

interface PlaceOrderResponse {
  orderNumber: string;
  orderId: string;
  status: string;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderType?: string }>();
  const businessId = useSessionStore((s) => s.businessId);
  const sessionName = useSessionStore((s) => s.customerName);
  const sessionPhone = useSessionStore((s) => s.phone);
  const { items, totalCents, clearCart } = useCartStore();

  const [orderType, setOrderType] = useState<OrderType>(
    (params.orderType as OrderType) ?? 'DELIVERY'
  );
  const [name, setName] = useState(sessionName ?? '');
  const [phone, setPhone] = useState(sessionPhone ?? '');
  const [address, setAddress] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  async function placeOrder() {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your phone number.');
      return;
    }
    if (orderType === 'DELIVERY' && !address.trim()) {
      Alert.alert('Required', 'Please enter your delivery address.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Please add items to your cart first.');
      return;
    }

    setLoading(true);
    try {
      // Portal service expects: customerName, phone, address, items: [{name, quantity, priceCents}]
      const notesWithTable = [
        tableNumber.trim() ? `Table: ${tableNumber.trim()}` : '',
        notes.trim(),
      ].filter(Boolean).join('. ');

      const payload = {
        businessId,
        customerName: name.trim(),
        phone: phone.trim(),
        address: orderType === 'DELIVERY' ? address.trim() : 'PICKUP',
        notes: notesWithTable || undefined,
        orderType,
        items: items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          priceCents: i.retailPriceCents,
        })),
        totalCents: totalCents(),
      };

      const result = await apiPost<PlaceOrderResponse>('/portal/order', payload);

      clearCart();
      router.replace({
        pathname: '/order-confirm',
        params: {
          orderNumber: result.orderNumber ?? result.orderId,
          orderType,
        },
      } as any);
    } catch (err: any) {
      Alert.alert('Order Failed', err.message ?? 'Could not place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Order Type */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order Type</Text>
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
                    {type === 'DELIVERY' ? 'Delivery' : 'Pickup / Dine-In'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Customer Details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Details</Text>

            <Text style={styles.fieldLabel}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. John Kamau"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>Phone Number *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+254700000000"
              keyboardType="phone-pad"
              placeholderTextColor={Colors.textSecondary}
            />

            {orderType === 'DELIVERY' ? (
              <>
                <Text style={styles.fieldLabel}>Delivery Address *</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="e.g. Westlands, Nairobi — Gate 5, Green Apartments"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Table Number (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={tableNumber}
                  onChangeText={setTableNumber}
                  placeholder="e.g. 7"
                  keyboardType="number-pad"
                  placeholderTextColor={Colors.textSecondary}
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any special instructions..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          {/* Order Summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order Summary</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.summaryRow}>
                <View style={styles.summaryLeft}>
                  <Text style={styles.summaryQty}>{item.quantity}x</Text>
                  <Text style={styles.summaryName} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Text style={styles.summaryPrice}>
                  {formatKES(item.retailPriceCents * item.quantity)}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatKES(totalCents())}</Text>
            </View>
          </View>

          {/* Place Order Button */}
          <TouchableOpacity
            style={[styles.placeBtn, loading && { opacity: 0.7 }]}
            onPress={placeOrder}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                <Text style={styles.placeBtnText}>Place Order</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By placing an order you agree to our terms. You will receive an SMS confirmation.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  toggleRow: { flexDirection: 'row', gap: 10 },
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
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  toggleBtnTextActive: { color: '#FFFFFF', fontWeight: '600' },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  multilineInput: {
    height: 72,
    textAlignVertical: 'top',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  summaryQty: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    minWidth: 24,
  },
  summaryName: { fontSize: 13, color: Colors.text, flex: 1 },
  summaryPrice: { fontSize: 13, fontWeight: '600', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  placeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  placeBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  disclaimer: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },
});
