import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useCartStore } from '../stores/cart';
import { queueSale } from '../lib/db';
import { Colors } from '../constants/theme';

type PaymentMethod = 'CASH' | 'MPESA' | 'CARD' | 'BANK_TRANSFER' | 'SPLIT';

interface SaleResult {
  id: string;
  receiptNumber: string;
  totalCents: number;
}

interface SalePayload {
  offlineId: string;
  businessId: string;
  storeId: string;
  cashierId: string;
  customerId?: string;
  type: 'NORMAL';
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
  discountCents?: number;
}

const PAYMENT_METHODS: Array<{ key: PaymentMethod; label: string; icon: any; color: string }> = [
  { key: 'CASH', label: 'Cash', icon: 'cash-outline', color: Colors.success },
  { key: 'MPESA', label: 'M-Pesa', icon: 'phone-portrait-outline', color: '#00A651' },
  { key: 'CARD', label: 'Card', icon: 'card-outline', color: Colors.indigo },
  { key: 'BANK_TRANSFER', label: 'Bank', icon: 'business-outline', color: Colors.primary },
  { key: 'SPLIT', label: 'Split', icon: 'shuffle-outline', color: Colors.warning },
];

function calculateVAT(totalCents: number): { vatCents: number; exVatCents: number } {
  // VAT inclusive: price × 16/116
  const vatCents = Math.round((totalCents * 16) / 116);
  return { vatCents, exVatCents: totalCents - vatCents };
}

function generateOfflineId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function PaymentScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const { items: cartItems, subtotalCents, clearCart, customerId, priceLevel } = useCartStore();

  const businessId = user?.businessId ?? 'biz-001';
  const storeId = user?.storeId ?? 'store-001';
  const cashierId = user?.id ?? '';

  const subtotal = subtotalCents();
  const { vatCents, exVatCents } = calculateVAT(subtotal);

  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [amountTendered, setAmountTendered] = useState('');
  const [mpesaRef, setMpesaRef] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [splitCash, setSplitCash] = useState('');
  const [splitMpesa, setSplitMpesa] = useState('');
  const [splitMpesaRef, setSplitMpesaRef] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleResult | null>(null);

  // Discount
  const discountVal = parseFloat(discountInput || '0') || 0;
  const rawDiscount =
    discountType === 'percent'
      ? Math.round((subtotal * discountVal) / 100)
      : Math.round(discountVal * 100);
  const effectiveDiscount = Math.min(rawDiscount, subtotal);
  const totalAfterDiscount = subtotal - effectiveDiscount;
  const { vatCents: finalVat } = calculateVAT(totalAfterDiscount);

  const tendered = Math.round((parseFloat(amountTendered || '0') || 0) * 100);
  const change = Math.max(0, tendered - totalAfterDiscount);

  function buildPayments(): Array<{ method: string; amountCents: number; reference?: string }> | null {
    if (payMethod === 'SPLIT') {
      const cash = Math.round((parseFloat(splitCash || '0') || 0) * 100);
      const mpesa = Math.round((parseFloat(splitMpesa || '0') || 0) * 100);
      const card = Math.round((parseFloat(splitCard || '0') || 0) * 100);
      const splitTotal = cash + mpesa + card;
      if (splitTotal < totalAfterDiscount) {
        Alert.alert(
          'Insufficient',
          `Split total (${formatKES(splitTotal)}) is less than the order total (${formatKES(totalAfterDiscount)}).`
        );
        return null;
      }
      const payments: Array<{ method: string; amountCents: number; reference?: string }> = [];
      if (cash > 0) payments.push({ method: 'CASH', amountCents: cash });
      if (mpesa > 0) payments.push({ method: 'MPESA', amountCents: mpesa, reference: splitMpesaRef || undefined });
      if (card > 0) payments.push({ method: 'CARD', amountCents: card });
      return payments;
    }
    if (payMethod === 'MPESA' && !mpesaRef.trim()) {
      Alert.alert('Required', 'Please enter the M-Pesa transaction code.');
      return null;
    }
    if (payMethod === 'BANK_TRANSFER' && !bankRef.trim()) {
      Alert.alert('Required', 'Please enter the bank transfer reference.');
      return null;
    }
    if (payMethod === 'CASH' && tendered < totalAfterDiscount) {
      Alert.alert('Insufficient', 'Amount tendered is less than the total.');
      return null;
    }
    const payment: { method: string; amountCents: number; reference?: string } = {
      method: payMethod,
      amountCents: totalAfterDiscount,
    };
    if (payMethod === 'MPESA') payment.reference = mpesaRef.trim();
    if (payMethod === 'BANK_TRANSFER') payment.reference = bankRef.trim();
    return [payment];
  }

  const { mutate: completeSale, isPending } = useMutation({
    mutationFn: async (payload: SalePayload) => {
      try {
        return await mobileApi.post<SaleResult>('/sales', payload);
      } catch (err) {
        await queueSale(payload.offlineId, payload);
        throw err;
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      clearCart();
      setCompletedSale(result);
      setShowSuccess(true);
    },
    onError: (err: any) => {
      Alert.alert(
        'Saved Offline',
        err.message?.includes('fetch')
          ? 'No internet connection. Sale saved to offline queue and will sync when online.'
          : `Sale queued. Error: ${err.message ?? 'Unknown'}`,
        [{ text: 'OK', onPress: () => { clearCart(); router.replace('/(tabs)/pos'); } }]
      );
    },
  });

  function handleCompleteSale() {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'No items in cart.');
      return;
    }
    const payments = buildPayments();
    if (!payments) return;

    const payload: SalePayload = {
      offlineId: generateOfflineId(),
      businessId,
      storeId,
      cashierId,
      customerId: customerId ?? undefined,
      type: 'NORMAL',
      priceLevel,
      items: cartItems.map((i) => ({ itemId: i.id, quantity: i.quantity })),
      payments,
      discountCents: effectiveDiscount > 0 ? effectiveDiscount : undefined,
    };
    completeSale(payload);
  }

  function handleNewSale() {
    setShowSuccess(false);
    setCompletedSale(null);
    router.replace('/(tabs)/pos');
  }

  const splitTotal =
    Math.round((parseFloat(splitCash || '0') || 0) * 100) +
    Math.round((parseFloat(splitMpesa || '0') || 0) * 100) +
    Math.round((parseFloat(splitCard || '0') || 0) * 100);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Order Summary */}
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.card}>
            {cartItems.map((item) => (
              <View key={item.id} style={styles.cartRow}>
                <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cartItemQty}>{item.quantity}x</Text>
                <Text style={styles.cartItemTotal}>{formatKES(item.unitPriceCents * item.quantity)}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Subtotal (ex-VAT)</Text>
              <Text style={styles.summaryValue}>{formatKES(exVatCents)}</Text>
            </View>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>VAT (16%)</Text>
              <Text style={styles.summaryValue}>{formatKES(vatCents)}</Text>
            </View>
          </View>

          {/* Discount */}
          <Text style={styles.sectionTitle}>Discount (Optional)</Text>
          <View style={styles.card}>
            <View style={styles.discountTypeRow}>
              <TouchableOpacity
                style={[styles.discountTypeBtn, discountType === 'amount' && styles.discountTypeBtnActive]}
                onPress={() => setDiscountType('amount')}
              >
                <Text style={[styles.discountTypeBtnText, discountType === 'amount' && styles.discountTypeBtnTextActive]}>
                  KES Amount
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.discountTypeBtn, discountType === 'percent' && styles.discountTypeBtnActive]}
                onPress={() => setDiscountType('percent')}
              >
                <Text style={[styles.discountTypeBtnText, discountType === 'percent' && styles.discountTypeBtnTextActive]}>
                  Percentage %
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputWrapper}>
              <Ionicons name="pricetag-outline" size={16} color={Colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={discountInput}
                onChangeText={setDiscountInput}
                placeholder={discountType === 'amount' ? '0.00' : '0'}
                keyboardType="decimal-pad"
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.inputSuffix}>{discountType === 'percent' ? '%' : 'KES'}</Text>
            </View>
            {effectiveDiscount > 0 && (
              <Text style={styles.discountPreview}>Discount: -{formatKES(effectiveDiscount)}</Text>
            )}
          </View>

          {/* Total */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatKES(totalAfterDiscount)}</Text>
          </View>

          {/* Payment Method */}
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.methodBtn,
                  payMethod === m.key && {
                    borderColor: m.color,
                    borderWidth: 2,
                    backgroundColor: m.color + '12',
                  },
                ]}
                onPress={() => setPayMethod(m.key)}
              >
                <Ionicons
                  name={m.icon}
                  size={22}
                  color={payMethod === m.key ? m.color : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.methodText,
                    payMethod === m.key && { color: m.color, fontWeight: '700' },
                  ]}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cash Details */}
          {payMethod === 'CASH' && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Amount Tendered (KES)</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="cash-outline" size={16} color={Colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  value={amountTendered}
                  onChangeText={setAmountTendered}
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              {tendered >= totalAfterDiscount && tendered > 0 && (
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>Change</Text>
                  <Text style={styles.changeValue}>{formatKES(change)}</Text>
                </View>
              )}
              {/* Quick amount shortcuts */}
              <View style={styles.quickAmounts}>
                {[totalAfterDiscount, 50000, 100000, 200000, 500000]
                  .filter((amt) => amt >= totalAfterDiscount)
                  .slice(0, 4)
                  .map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={styles.quickBtn}
                      onPress={() => setAmountTendered((amt / 100).toFixed(2))}
                    >
                      <Text style={styles.quickBtnText}>{formatKES(amt)}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </View>
          )}

          {/* M-Pesa */}
          {payMethod === 'MPESA' && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>M-Pesa Transaction Code *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="phone-portrait-outline" size={16} color={Colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  value={mpesaRef}
                  onChangeText={setMpesaRef}
                  placeholder="e.g. QJ12345XYZ"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <Text style={styles.fieldHint}>Ask customer for the M-Pesa SMS confirmation code.</Text>
            </View>
          )}

          {/* Bank Transfer */}
          {payMethod === 'BANK_TRANSFER' && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Bank Transfer Reference *</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="business-outline" size={16} color={Colors.textSecondary} />
                <TextInput
                  style={styles.input}
                  value={bankRef}
                  onChangeText={setBankRef}
                  placeholder="Transfer reference / slip no."
                  autoCorrect={false}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>
          )}

          {/* Card */}
          {payMethod === 'CARD' && (
            <View style={styles.card}>
              <View style={styles.infoNotice}>
                <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
                <Text style={styles.infoNoticeText}>
                  Process card payment on terminal. Full amount: {formatKES(totalAfterDiscount)}
                </Text>
              </View>
            </View>
          )}

          {/* Split Payment */}
          {payMethod === 'SPLIT' && (
            <View style={styles.card}>
              <Text style={styles.fieldLabel}>Split Payment Amounts</Text>
              <Text style={styles.fieldHint}>Total to cover: {formatKES(totalAfterDiscount)}</Text>

              <View style={styles.splitField}>
                <Text style={styles.splitLabel}>Cash</Text>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    value={splitCash}
                    onChangeText={setSplitCash}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <Text style={styles.inputSuffix}>KES</Text>
                </View>
              </View>

              <View style={styles.splitField}>
                <Text style={styles.splitLabel}>M-Pesa</Text>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    value={splitMpesa}
                    onChangeText={setSplitMpesa}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <Text style={styles.inputSuffix}>KES</Text>
                </View>
              </View>

              {parseFloat(splitMpesa || '0') > 0 && (
                <View style={styles.splitField}>
                  <Text style={styles.splitLabel}>M-Pesa Code</Text>
                  <View style={[styles.inputWrapper, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      value={splitMpesaRef}
                      onChangeText={setSplitMpesaRef}
                      placeholder="Transaction code"
                      autoCapitalize="characters"
                      placeholderTextColor={Colors.textSecondary}
                    />
                  </View>
                </View>
              )}

              <View style={styles.splitField}>
                <Text style={styles.splitLabel}>Card</Text>
                <View style={[styles.inputWrapper, { flex: 1 }]}>
                  <TextInput
                    style={styles.input}
                    value={splitCard}
                    onChangeText={setSplitCard}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                    placeholderTextColor={Colors.textSecondary}
                  />
                  <Text style={styles.inputSuffix}>KES</Text>
                </View>
              </View>

              <View style={styles.changeRow}>
                <Text style={styles.changeLabel}>
                  {splitTotal >= totalAfterDiscount ? 'Covered' : 'Remaining'}
                </Text>
                <Text
                  style={[
                    styles.changeValue,
                    { color: splitTotal >= totalAfterDiscount ? Colors.success : Colors.error },
                  ]}
                >
                  {splitTotal >= totalAfterDiscount
                    ? formatKES(splitTotal)
                    : `-${formatKES(totalAfterDiscount - splitTotal)}`}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Complete Sale Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.completeBtn, isPending && { opacity: 0.7 }]}
            onPress={handleCompleteSale}
            disabled={isPending}
            activeOpacity={0.85}
          >
            {isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                <Text style={styles.completeBtnText}>
                  Complete Sale · {formatKES(totalAfterDiscount)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      <Modal visible={showSuccess} animationType="fade" transparent>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
            </View>
            <Text style={styles.successTitle}>Sale Complete!</Text>
            {completedSale && (
              <>
                <Text style={styles.successReceipt}>Receipt #{completedSale.receiptNumber}</Text>
                <Text style={styles.successTotal}>{formatKES(completedSale.totalCents)}</Text>
              </>
            )}
            {payMethod === 'CASH' && change > 0 && (
              <View style={styles.changeCard}>
                <Text style={styles.changeCardLabel}>Change to give customer</Text>
                <Text style={styles.changeCardValue}>{formatKES(change)}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.newSaleBtn} onPress={handleNewSale} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.newSaleBtnText}>New Sale</Text>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 12, paddingBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cartRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  cartItemName: { flex: 1, fontSize: 13, color: Colors.text },
  cartItemQty: { fontSize: 12, color: Colors.textSecondary, width: 24, textAlign: 'center' },
  cartItemTotal: { fontSize: 13, fontWeight: '700', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontSize: 13, color: Colors.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  totalCard: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { fontSize: 16, color: '#FFFFFF99', fontWeight: '600' },
  totalValue: { fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  discountTypeRow: { flexDirection: 'row', gap: 8 },
  discountTypeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  discountTypeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '12' },
  discountTypeBtnText: { fontSize: 13, color: Colors.textSecondary },
  discountTypeBtnTextActive: { color: Colors.primary, fontWeight: '700' },
  discountPreview: { fontSize: 12, color: Colors.error, fontWeight: '600' },
  methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodBtn: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  methodText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500', textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text },
  fieldHint: { fontSize: 11, color: Colors.textSecondary },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, paddingVertical: 11, fontSize: 15, color: Colors.text },
  inputSuffix: { fontSize: 13, color: Colors.textSecondary },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  changeLabel: { fontSize: 14, color: Colors.textSecondary },
  changeValue: { fontSize: 18, fontWeight: '800', color: Colors.success },
  quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  quickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: Colors.primary + '12',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  quickBtnText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.primary + '10',
    padding: 12,
    borderRadius: 10,
  },
  infoNoticeText: { flex: 1, fontSize: 13, color: Colors.primary },
  splitField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitLabel: { fontSize: 12, color: Colors.textSecondary, width: 60 },
  footer: {
    padding: 16,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  completeBtn: {
    backgroundColor: Colors.success,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  completeBtnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },

  // Success modal
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  successIconWrap: { marginBottom: 4 },
  successTitle: { fontSize: 24, fontWeight: '900', color: Colors.text },
  successReceipt: { fontSize: 14, color: Colors.textSecondary },
  successTotal: { fontSize: 30, fontWeight: '900', color: Colors.primary },
  changeCard: {
    backgroundColor: Colors.success + '12',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  changeCardLabel: { fontSize: 13, color: Colors.textSecondary },
  changeCardValue: { fontSize: 26, fontWeight: '900', color: Colors.success },
  newSaleBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    width: '100%',
    justifyContent: 'center',
  },
  newSaleBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
