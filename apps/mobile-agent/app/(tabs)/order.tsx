/**
 * New Order — van-sales order capture. Pick a customer, add catalog items
 * with quantities, then submit. Handles the CREDIT_LIMIT_EXCEEDED response.
 */
import {
  View, Text, TextInput, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, Modal, Switch, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Print from 'expo-print';
import { agentApi, formatKES } from '../../lib/api';
import { enqueue, flushQueue, uuid } from '../../lib/offline';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';

interface OrderSnapshot {
  orderNumber?: string;
  customerName?: string | null;
  lines: Array<{ itemName: string; quantity: number; unitPriceCents: number }>;
  subtotalCents: number;
}

/** Build + open a printable/shareable order confirmation (Bluetooth/AirPrint/share). */
async function printOrderConfirmation(snap: OrderSnapshot) {
  const rows = snap.lines
    .map(
      (l) => `<tr><td>${l.itemName}</td><td style="text-align:center">${l.quantity}</td>` +
        `<td style="text-align:right">${formatKES(l.unitPriceCents)}</td>` +
        `<td style="text-align:right">${formatKES(l.unitPriceCents * l.quantity)}</td></tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>body{font-family:Arial,sans-serif;padding:20px;font-size:14px}h1{font-size:20px;text-align:center;margin:0 0 4px}
    .sub{text-align:center;color:#555;margin:0 0 14px}table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}
    .total{font-weight:bold;font-size:16px;text-align:right;margin-top:12px}.foot{margin-top:24px;text-align:center;color:#777;font-size:12px}</style>
    </head><body>
    <h1>ORDER CONFIRMATION</h1>
    <p class="sub">${snap.orderNumber ? `Order #${snap.orderNumber} · ` : ''}${new Date().toLocaleString('en-KE')}</p>
    <p><strong>Customer:</strong> ${snap.customerName ?? '—'}</p>
    <table><thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <p class="total">TOTAL: ${formatKES(snap.subtotalCents)}</p>
    <p class="foot">Thank you for your business.</p>
    </body></html>`;
  await Print.printAsync({ html });
}

interface Item {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  retailPriceCents: number;
  quantity: number; // current stock level
}

interface Customer { id: string; name: string; }

export default function OrderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const agentId = user?.id ?? '';

  const cart = useCartStore();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const items = useQuery<Item[]>({
    queryKey: ['catalog', businessId],
    queryFn: () => agentApi.get<Item[]>(`/items?businessId=${businessId}&activeOnly=true`),
    enabled: !!businessId,
  });

  const customers = useQuery<Customer[]>({
    queryKey: ['agent-customers-picker', agentId, businessId],
    queryFn: () => agentApi.get<Customer[]>(`/field-sales/customers?agentId=${agentId}&businessId=${businessId}`),
    enabled: !!agentId && !!businessId && pickerOpen,
  });

  const filtered = useMemo(() => {
    const list = items.data ?? [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter((i) => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
  }, [items.data, search]);

  const submit = useMutation({
    mutationFn: async () => {
      const offlineId = uuid();
      const body = {
        offlineId,
        agentId,
        businessId,
        customerId: cart.customerId,
        customerName: cart.customerName,
        items: cart.lines.map((l) => ({
          itemId: l.itemId,
          itemName: l.itemName,
          itemSku: l.itemSku,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
        })),
        notes: cart.notes || undefined,
        isSampleOrder: cart.isSampleOrder,
      };

      // Try the network first so the agent gets immediate feedback (especially
      // the credit-limit rejection) when they DO have signal.
      try {
        return await agentApi.post('/field-sales/orders', body);
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('CREDIT_LIMIT') || msg.toLowerCase().includes('credit limit')) {
          throw e; // real rejection — surface it, do not queue
        }
        if (!msg.includes('Network request failed')) {
          throw e; // other server error — surface it
        }
        // Offline: queue for later. Same offlineId → server dedupes on replay.
        await enqueue({
          offlineId,
          type: 'CREATE_ORDER',
          path: '/field-sales/orders',
          body,
          label: `Order for ${cart.customerName ?? 'customer'} · ${formatKES(cart.subtotalCents())}`,
        });
        return { queued: true };
      }
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['agent-stats'] });
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
      const queued = (res as { queued?: boolean })?.queued;
      const snap: OrderSnapshot = {
        orderNumber: (res as { orderNumber?: string })?.orderNumber,
        customerName: cart.customerName,
        lines: cart.lines.map((l) => ({ itemName: l.itemName, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
        subtotalCents: cart.subtotalCents(),
      };
      const date = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
      const itemLines = snap.lines.map((l) => `  - ${l.itemName} x${l.quantity}  ${formatKES(l.unitPriceCents * l.quantity)}`).join('\n');
      const waMsg = `ORDER CONFIRMATION\nOrder: ${snap.orderNumber ?? 'OFFLINE'}\nDate: ${date}\nCustomer: ${snap.customerName ?? '-'}\n---\n${itemLines}\n---\nTotal: ${formatKES(snap.subtotalCents)}\n\nThank you for your order!`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
      const done = () => { cart.clear(); router.replace('/(tabs)/today'); };
      Alert.alert(
        queued ? 'Order Saved Offline' : 'Order Submitted!',
        queued ? 'Saved on your phone - will sync when back online.' : `Order ${snap.orderNumber ?? ''} submitted.`,
        [
          { text: 'WhatsApp', onPress: async () => { try { await Linking.openURL(waUrl); } catch (_) { /* ignore */ } done(); } },
          { text: 'Print', onPress: async () => { try { await printOrderConfirmation(snap); } catch (_) { /* cancelled */ } done(); } },
          { text: 'OK', onPress: done },
        ],
      );
    },
        onError: (e) => {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('INSUFFICIENT_STOCK') || msg.toLowerCase().includes('insufficient stock')) {
        Alert.alert('Not Enough Stock', msg);
      } else if (msg.includes('CREDIT_LIMIT') || msg.toLowerCase().includes('credit limit')) {
        Alert.alert('Credit Limit Exceeded', 'This order would push the customer over their credit limit. Collect a payment first, or request a credit increase.');
      } else {
        Alert.alert('Could not save order', msg || 'Please try again.');
      }
    },
  });

  function handleSubmit() {
    if (!cart.customerId) { Alert.alert('Pick a customer', 'Choose which shop this order is for.'); return; }
    if (cart.lines.length === 0) { Alert.alert('Empty order', 'Add at least one item.'); return; }
    submit.mutate();
  }

  const subtotal = cart.subtotalCents();

  return (
    <View style={st.safe}>
      <View style={st.header}>
        <Text style={st.title}>New Order</Text>
        {cart.lines.length > 0 && (
          <TouchableOpacity onPress={() => cart.clear()}>
            <Text style={st.clearLink}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer selector */}
      <TouchableOpacity style={st.customerPick} onPress={() => setPickerOpen(true)}>
        <Ionicons name="storefront" size={20} color={Colors.primary} />
        <Text style={[st.customerText, !cart.customerName && { color: Colors.textSecondary }]}>
          {cart.customerName ?? 'Select customer'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      {/* Sample toggle */}
      <View style={st.sampleRow}>
        <Text style={st.sampleLabel}>Sample order (no charge / no credit check)</Text>
        <Switch
          value={cart.isSampleOrder}
          onValueChange={cart.setSample}
          trackColor={{ true: Colors.primaryLight }}
          thumbColor={cart.isSampleOrder ? Colors.primary : '#f4f3f4'}
        />
      </View>

      {/* Catalog search */}
      <View style={st.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={st.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search items to add"
          placeholderTextColor={Colors.textSecondary}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 220 }}
        ListEmptyComponent={items.isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} /> : <Text style={st.noItems}>No items in catalog.</Text>}
        renderItem={({ item }) => {
          const line = cart.lines.find((l) => l.itemId === item.id);
          const cartQty = line?.quantity ?? 0;
          const outOfStock = item.quantity <= 0;
          const lowStock = !outOfStock && item.quantity <= 5;
          const stockLabel = outOfStock
            ? 'Out of stock'
            : lowStock
            ? `Low: ${item.quantity} left${cartQty > 0 ? ` (${cartQty} in cart)` : ''}`
            : `Stock: ${item.quantity}${cartQty > 0 ? ` (${cartQty} in cart)` : ''}`;
          const stockColor = outOfStock ? Colors.error : lowStock ? Colors.warning : Colors.textSecondary;
          return (
            <View style={[st.itemRow, outOfStock && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <Text style={st.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={st.itemPrice}>{formatKES(item.retailPriceCents)}</Text>
                <Text style={[st.stockLabel, { color: stockColor }]}>{stockLabel}</Text>
              </View>
              {line ? (
                <View style={st.qtyControls}>
                  <TouchableOpacity style={st.qtyBtn} onPress={() => {
                    const idx = cart.lines.findIndex((l) => l.itemId === item.id);
                    cart.updateQty(idx, line.quantity - 1);
                  }}>
                    <Ionicons name="remove" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={st.qtyText}>{line.quantity}</Text>
                  <TouchableOpacity
                    style={[st.qtyBtn, cartQty >= item.quantity && !cart.isSampleOrder && { opacity: 0.4 }]}
                    disabled={cartQty >= item.quantity && !cart.isSampleOrder}
                    onPress={() => {
                      const idx = cart.lines.findIndex((l) => l.itemId === item.id);
                      cart.updateQty(idx, line.quantity + 1);
                    }}>
                    <Ionicons name="add" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[st.addItemBtn, outOfStock && !cart.isSampleOrder && { backgroundColor: Colors.textSecondary }]}
                  disabled={outOfStock && !cart.isSampleOrder}
                  onPress={() => cart.addLine({ itemId: item.id, itemName: item.name, itemSku: item.sku ?? undefined, quantity: 1, unitPriceCents: item.retailPriceCents })}
                >
                  <Ionicons name="add" size={18} color="#FFF" />
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />

      {/* Bottom summary bar */}
      {cart.lines.length > 0 && (
        <View style={st.bottomBar}>
          <View style={{ flex: 1 }}>
            <Text style={st.summaryItems}>{cart.lines.reduce((n, l) => n + l.quantity, 0)} items</Text>
            <Text style={st.summaryTotal}>{formatKES(subtotal)}</Text>
          </View>
          <TouchableOpacity style={[st.submitBtn, submit.isPending && { opacity: 0.7 }]} onPress={handleSubmit} disabled={submit.isPending}>
            {submit.isPending ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle" size={20} color="#FFF" /><Text style={st.submitText}>Save Order</Text></>}
          </TouchableOpacity>
        </View>
      )}

      {/* Customer picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={st.modalBackdrop}>
          <View style={st.modalSheet}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Select customer</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
            </View>
            <FlatList
              data={customers.data ?? []}
              keyExtractor={(c) => c.id}
              ListEmptyComponent={customers.isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 16 }} /> : <Text style={st.noItems}>No customers.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={st.pickRow} onPress={() => { cart.setCustomer(item.id, item.name); setPickerOpen(false); }}>
                  <Ionicons name="storefront-outline" size={20} color={Colors.primary} />
                  <Text style={st.pickName}>{item.name}</Text>
                  {cart.customerId === item.id && <Ionicons name="checkmark-circle" size={20} color={Colors.success} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  clearLink: { fontSize: 14, color: Colors.error, fontWeight: '600' },
  customerPick: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10,
    backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14,
  },
  customerText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  sampleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 10 },
  sampleLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: Colors.text },
  noItems: { textAlign: 'center', color: Colors.textSecondary, marginTop: 24, fontSize: 14 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: 12,
    padding: 12, marginBottom: 8,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  itemPrice: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 2 },
  stockLabel: { fontSize: 11, marginTop: 2 },
  addItemBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  qtyText: { fontSize: 16, fontWeight: '700', color: Colors.text, minWidth: 24, textAlign: 'center' },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 16, backgroundColor: Colors.card, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  summaryItems: { fontSize: 12, color: Colors.textSecondary },
  summaryTotal: { fontSize: 18, fontWeight: '800', color: Colors.text },
  exVat: { fontSize: 12, color: Colors.textSecondary, fontWeight: '400' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  pickName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
});
