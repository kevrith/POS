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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { apiGet, apiPost, formatKES } from '../lib/api';
import { registerCustomerPushToken } from '../lib/push';
import { initiateStk, pollStkUntilDone } from '../lib/payments';
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

  // Saved delivery addresses
  const [savedAddresses, setSavedAddresses] = useState<{ id: string; label?: string | null; address: string; isDefault: boolean }[]>([]);
  const [saveAddress, setSaveAddress] = useState(true);

  useEffect(() => {
    let active = true;
    apiGet<{ id: string; label?: string | null; address: string; isDefault: boolean }[]>('/portal/me/addresses')
      .then((list) => {
        if (!active) return;
        setSavedAddresses(list);
        // Prefill with the default address if the field is still empty.
        const def = list.find((a) => a.isDefault) ?? list[0];
        if (def) setAddress((prev) => prev || def.address);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const [tipCents, setTipCents] = useState(0);

  // Post-order M-Pesa payment step.
  const [placed, setPlaced] = useState<{ orderNumber: string; orderId: string; amountCents: number } | null>(null);
  const [payState, setPayState] = useState<'idle' | 'sending' | 'waiting' | 'paid' | 'failed'>('idle');

  const grandTotal = () => totalCents() + tipCents;

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
        tipCents > 0 ? `Tip: ${formatKES(tipCents)}` : '',
      ].filter(Boolean).join('. ');

      const orderTotal = grandTotal();
      const payload = {
        businessId,
        customerName: name.trim(),
        phone: phone.trim(),
        address: orderType === 'DELIVERY' ? address.trim() : 'PICKUP',
        notes: notesWithTable || undefined,
        orderType,
        items: items.map((i) => ({
          itemId: i.id, // cart id is the catalog item id — enables Sale reconciliation
          name: i.name,
          quantity: i.quantity,
          priceCents: i.retailPriceCents,
        })),
        totalCents: orderTotal,
      };
      const result = await apiPost<PlaceOrderResponse>('/portal/order', payload);

      // Register for order-status push now that this customer record exists.
      void registerCustomerPushToken(businessId, phone.trim());

      // Save a brand-new delivery address for next time, if opted in.
      if (
        orderType === 'DELIVERY' && saveAddress && address.trim() &&
        !savedAddresses.some((a) => a.address.trim() === address.trim())
      ) {
        void apiPost('/portal/me/addresses', { address: address.trim(), isDefault: savedAddresses.length === 0 }).catch(() => {});
      }

      clearCart();
      // Offer in-app M-Pesa payment before navigating to the confirmation.
      setPlaced({ orderNumber: result.orderNumber ?? result.orderId, orderId: result.orderId, amountCents: orderTotal });
    } catch (err: any) {
      Alert.alert('Order Failed', err.message ?? 'Could not place order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function goToConfirm(paid: boolean) {
    const orderNumber = placed?.orderNumber ?? '';
    setPlaced(null);
    router.replace({
      pathname: '/order-confirm',
      params: { orderNumber, orderType, paid: paid ? '1' : '0' },
    } as any);
  }

  async function payWithMpesa() {
    if (!placed) return;
    setPayState('sending');
    try {
      const { checkoutRequestId } = await initiateStk(phone.trim(), placed.amountCents, placed.orderNumber);
      setPayState('waiting');
      const status = await pollStkUntilDone(checkoutRequestId);
      if (status === 'paid') {
        // Reconcile server-side: marks the order PAID and creates the Sale
        // (inventory + loyalty + eTIMS). Best-effort — confirmation still proceeds.
        void apiPost(`/portal/order/${placed.orderId}/confirm-payment`, { checkoutRequestId }).catch(() => {});
        setPayState('paid');
        setTimeout(() => goToConfirm(true), 1200);
      } else {
        setPayState('failed');
      }
    } catch (err: any) {
      setPayState('failed');
      Alert.alert('Payment Error', err.message ?? 'Could not start M-Pesa payment.');
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
                {savedAddresses.length > 0 ? (
                  <View style={styles.addrChips}>
                    {savedAddresses.map((a) => {
                      const active = address.trim() === a.address.trim();
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={[styles.addrChip, active && styles.addrChipActive]}
                          onPress={() => setAddress(a.address)}
                        >
                          <Ionicons name="location" size={13} color={active ? '#FFFFFF' : Colors.primary} />
                          <Text style={[styles.addrChipText, active && { color: '#FFFFFF' }]} numberOfLines={1}>
                            {a.label || a.address}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
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
                {!savedAddresses.some((a) => a.address.trim() === address.trim()) && address.trim() ? (
                  <TouchableOpacity style={styles.saveAddrRow} onPress={() => setSaveAddress((v) => !v)}>
                    <Ionicons name={saveAddress ? 'checkbox' : 'square-outline'} size={18} color={Colors.primary} />
                    <Text style={styles.saveAddrText}>Save this address for next time</Text>
                  </TouchableOpacity>
                ) : null}
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

            {/* Tip */}
            <Text style={styles.tipLabel}>Add a tip?</Text>
            <View style={styles.tipRow}>
              {[
                { label: 'None', cents: 0 },
                { label: 'KES 50', cents: 5000 },
                { label: 'KES 100', cents: 10000 },
                { label: '10%', cents: Math.round(totalCents() * 0.1) },
              ].map((opt) => {
                const active = tipCents === opt.cents;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.tipChip, active && styles.tipChipActive]}
                    onPress={() => setTipCents(opt.cents)}
                  >
                    <Text style={[styles.tipChipText, active && { color: '#FFF' }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {tipCents > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryName}>Tip</Text>
                <Text style={styles.summaryPrice}>{formatKES(tipCents)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatKES(grandTotal())}</Text>
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

      {/* Post-order M-Pesa payment step */}
      <Modal visible={!!placed} animationType="slide" transparent onRequestClose={() => goToConfirm(false)}>
        <View style={styles.payBackdrop}>
          <View style={styles.paySheet}>
            <View style={styles.payIconWrap}>
              <Ionicons
                name={payState === 'paid' ? 'checkmark-circle' : payState === 'failed' ? 'close-circle' : 'phone-portrait'}
                size={44}
                color={payState === 'paid' ? Colors.success : payState === 'failed' ? Colors.error : Colors.primary}
              />
            </View>
            <Text style={styles.payTitle}>
              {payState === 'paid' ? 'Payment received!' :
               payState === 'failed' ? 'Payment not completed' :
               payState === 'waiting' ? 'Check your phone' :
               'Pay with M-Pesa?'}
            </Text>
            <Text style={styles.paySub}>
              {payState === 'paid' ? `Order ${placed?.orderNumber} is paid.` :
               payState === 'waiting' ? `Enter your M-Pesa PIN to pay ${placed ? formatKES(placed.amountCents) : ''}.` :
               payState === 'failed' ? 'You can try again or pay on delivery.' :
               `Order ${placed?.orderNumber} · ${placed ? formatKES(placed.amountCents) : ''}`}
            </Text>

            {(payState === 'sending' || payState === 'waiting') ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: 16 }} />
            ) : payState === 'paid' ? null : (
              <>
                <TouchableOpacity style={styles.payBtn} onPress={payWithMpesa}>
                  <Ionicons name="phone-portrait" size={18} color="#FFF" />
                  <Text style={styles.payBtnText}>{payState === 'failed' ? 'Retry M-Pesa' : 'Send M-Pesa prompt'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.payLater} onPress={() => goToConfirm(false)}>
                  <Text style={styles.payLaterText}>{orderType === 'DELIVERY' ? 'Pay on delivery' : 'Pay at counter'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  addrChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  addrChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%',
    borderWidth: 1, borderColor: Colors.primary, borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: Colors.card,
  },
  addrChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  addrChipText: { fontSize: 12, color: Colors.primary, fontWeight: '600', flexShrink: 1 },
  saveAddrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  saveAddrText: { fontSize: 13, color: Colors.text },
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
  tipLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginBottom: 8 },
  tipRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tipChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  tipChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tipChipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  payBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  paySheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
    gap: 6,
  },
  payIconWrap: { marginBottom: 4 },
  payTitle: { fontSize: 19, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  paySub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  payBtn: {
    marginTop: 16,
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  payBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  payLater: { marginTop: 12, paddingVertical: 8 },
  payLaterText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
