/**
 * Collections — customers with outstanding balances and their unpaid
 * orders. The agent records a payment against an order (cash / M-Pesa).
 */
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi, formatKES } from '../../lib/api';
import { enqueue, uuid } from '../../lib/offline';
import { useAuthStore } from '../../stores/auth';
import { Colors } from '../../constants/theme';

interface UnpaidOrder {
  id: string;
  orderNumber: string | null;
  totalCents: number;
  paidAmountCents: number;
  balanceCents: number;
  agingDays: number;
}

interface CollectionCustomer {
  id: string;
  name: string;
  phone: string;
  shopCode: string | null;
  outstandingCents: number;
  agingDays: number;
  agingBucket: string;
  unpaidOrders: UnpaidOrder[];
}

const BUCKET_COLOR: Record<string, string> = { '0-30': '#16A34A', '31-60': '#F59E0B', '61-90': '#F97316', '90+': '#DC2626' };

export default function CollectionsScreen() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const agentId = user?.id ?? '';

  const { data, isLoading, isRefetching, refetch } = useQuery<CollectionCustomer[]>({
    queryKey: ['credit-collection', agentId, businessId],
    queryFn: () => agentApi.get<CollectionCustomer[]>(`/field-sales/credit-collection?agentId=${agentId}&businessId=${businessId}`),
    enabled: !!agentId && !!businessId,
  });

  const [payTarget, setPayTarget] = useState<{ order: UnpaidOrder; customer: CollectionCustomer } | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CASH' | 'MPESA'>('CASH');
  const [reference, setReference] = useState('');

  const collect = useMutation({
    mutationFn: async () => {
      const offlineId = uuid();
      const path = `/field-sales/orders/${payTarget!.order.id}/collect-payment?businessId=${businessId}`;
      const body = {
        offlineId,
        amountCents: Math.round(parseFloat(amount) * 100),
        method,
        reference: reference || undefined,
        collectedBy: agentId,
      };
      try {
        return await agentApi.post(path, body);
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        if (!msg.includes('Network request failed')) throw e; // server error → surface
        // Offline: queue. The offlineId is the dedup key — the server records the
        // payment exactly once even if this replays, so money is never double-counted.
        await enqueue({
          offlineId,
          type: 'COLLECT_PAYMENT',
          path,
          body,
          label: `Payment ${formatKES(body.amountCents)} · ${payTarget!.customer.name}`,
        });
        return { queued: true };
      }
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['credit-collection'] });
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
      const queued = (res as { queued?: boolean })?.queued;
      setPayTarget(null); setAmount(''); setReference(''); setMethod('CASH');
      Alert.alert(
        queued ? 'Payment Saved Offline' : 'Payment Recorded',
        queued ? 'Saved on your phone — it will sync automatically when you’re back online.' : 'The collection has been saved.',
      );
    },
    onError: (e) => Alert.alert('Could not record payment', (e as Error)?.message || 'Please try again.'),
  });

  function openPay(order: UnpaidOrder, customer: CollectionCustomer) {
    setPayTarget({ order, customer });
    setAmount((order.balanceCents / 100).toString());
  }

  const totalOutstanding = (data ?? []).reduce((s, c) => s + c.outstandingCents, 0);

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Text style={st.title}>Collections</Text>
        <Text style={st.totalOwed}>{formatKES(totalOutstanding)}</Text>
      </View>
      <Text style={st.subtitle}>Outstanding across {data?.length ?? 0} customers</Text>

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={
          isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} /> : (
            <View style={st.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={40} color={Colors.success} />
              <Text style={st.emptyText}>All clear!</Text>
              <Text style={st.emptySub}>No outstanding balances.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={st.card}>
            <View style={st.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{item.name}</Text>
                <Text style={st.meta}>{item.shopCode ?? '—'} · {item.phone}</Text>
              </View>
              <View style={st.owedCol}>
                <Text style={st.owedAmount}>{formatKES(item.outstandingCents)}</Text>
                <View style={[st.bucketTag, { backgroundColor: (BUCKET_COLOR[item.agingBucket] ?? Colors.textSecondary) + '22' }]}>
                  <Text style={[st.bucketText, { color: BUCKET_COLOR[item.agingBucket] ?? Colors.textSecondary }]}>{item.agingBucket} days</Text>
                </View>
              </View>
            </View>

            {item.unpaidOrders.map((o) => (
              <View key={o.id} style={st.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.orderNum}>{o.orderNumber ?? o.id.slice(0, 8)}</Text>
                  <Text style={st.orderMeta}>{formatKES(o.balanceCents)} due · {o.agingDays}d old</Text>
                </View>
                <TouchableOpacity style={st.collectBtn} onPress={() => openPay(o, item)}>
                  <Ionicons name="cash" size={15} color="#FFF" />
                  <Text style={st.collectText}>Collect</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={st.callRow} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
              <Ionicons name="call-outline" size={15} color={Colors.primary} />
              <Text style={st.callText}>Call customer</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Payment modal */}
      <Modal visible={!!payTarget} animationType="slide" transparent onRequestClose={() => setPayTarget(null)}>
        <View style={st.modalBackdrop}>
          <View style={st.modalSheet}>
            <View style={st.modalHeader}>
              <Text style={st.modalTitle}>Record Payment</Text>
              <TouchableOpacity onPress={() => setPayTarget(null)}><Ionicons name="close" size={24} color={Colors.text} /></TouchableOpacity>
            </View>
            {payTarget && (
              <>
                <Text style={st.modalSub}>{payTarget.customer.name} · {payTarget.order.orderNumber ?? payTarget.order.id.slice(0, 8)}</Text>
                <Text style={st.modalDue}>Balance due: {formatKES(payTarget.order.balanceCents)}</Text>

                <Text style={st.fieldLabel}>Amount (KES)</Text>
                <TextInput style={st.amountInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />

                <Text style={st.fieldLabel}>Method</Text>
                <View style={st.methodRow}>
                  {(['CASH', 'MPESA'] as const).map((m) => (
                    <TouchableOpacity key={m} style={[st.methodBtn, method === m && st.methodBtnActive]} onPress={() => setMethod(m)}>
                      <Ionicons name={m === 'CASH' ? 'cash-outline' : 'phone-portrait-outline'} size={18} color={method === m ? '#FFF' : Colors.text} />
                      <Text style={[st.methodText, method === m && { color: '#FFF' }]}>{m === 'CASH' ? 'Cash' : 'M-Pesa'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {method === 'MPESA' && (
                  <>
                    <Text style={st.fieldLabel}>M-Pesa reference (optional)</Text>
                    <TextInput style={st.refInput} value={reference} onChangeText={setReference} placeholder="e.g. SLK3X9..." autoCapitalize="characters" placeholderTextColor={Colors.textSecondary} />
                  </>
                )}

                <TouchableOpacity style={[st.payBtn, collect.isPending && { opacity: 0.7 }]} onPress={() => collect.mutate()} disabled={collect.isPending || !amount}>
                  {collect.isPending ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle" size={20} color="#FFF" /><Text style={st.payBtnText}>Record {amount ? formatKES(Math.round(parseFloat(amount) * 100) || 0) : 'Payment'}</Text></>}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  totalOwed: { fontSize: 18, fontWeight: '800', color: Colors.error },
  subtitle: { fontSize: 13, color: Colors.textSecondary, paddingHorizontal: 16, marginTop: 2, marginBottom: 8 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  owedCol: { alignItems: 'flex-end', gap: 4 },
  owedAmount: { fontSize: 15, fontWeight: '800', color: Colors.error },
  bucketTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  bucketText: { fontSize: 10, fontWeight: '700' },
  orderRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  orderNum: { fontSize: 13, fontWeight: '600', color: Colors.text },
  orderMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  collectBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.success, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8 },
  collectText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: Colors.border },
  callText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 40, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSub: { fontSize: 13, color: Colors.textSecondary },
  modalDue: { fontSize: 15, fontWeight: '700', color: Colors.error, marginTop: 4, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 6 },
  amountInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.card, paddingHorizontal: 14, paddingVertical: 14, fontSize: 22, fontWeight: '700', color: Colors.text },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  methodBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  methodText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  refInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.card, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, paddingVertical: 15, borderRadius: 12, marginTop: 20 },
  payBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
