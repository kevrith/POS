import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { canApprove } from '../lib/roles';
import { usePosMode } from '../lib/usePosMode';
import {
  poProgress, poTotalCents, receivedQty, outstandingQty, canReceive,
  normalizePoStatus, buildGrnPayload, parseQty, isValidExpiry,
  PO_STATUS_LABELS, type PurchaseOrder, type ReceiveRow,
} from '../lib/receiving';
import { Colors } from '../constants/theme';

interface CatalogItem { id: string; name: string; sku?: string }

/**
 * One purchase order: what was ordered, what has already arrived, and the form
 * for booking in today's delivery.
 *
 * `POItem` has no `item` relation, so the catalogue is fetched separately and
 * names are joined by `itemId` — without it every line would read as a UUID.
 */
export default function PurchaseOrderScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { poId } = useLocalSearchParams<{ poId: string }>();
  const { businessId, storeId } = useActiveStore();
  const role = useAuthStore((s) => s.user?.role);
  const { can } = usePosMode();
  const tracksBatches = can('batches');

  const [receiving, setReceiving] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [lot, setLot] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});

  const poQ = useQuery<PurchaseOrder>({
    queryKey: ['purchase-order', poId],
    queryFn: () => mobileApi.get<PurchaseOrder>(`/suppliers/purchase-orders/${poId}`),
    enabled: !!poId,
  });

  const itemsQ = useQuery<CatalogItem[]>({
    queryKey: ['items', businessId, storeId],
    queryFn: () => mobileApi.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && !!storeId,
    staleTime: 5 * 60_000,
  });

  const nameOf = useMemo(() => {
    const map = new Map((itemsQ.data ?? []).map((i) => [i.id, i.name]));
    return (id: string) => map.get(id) ?? 'Unknown item';
  }, [itemsQ.data]);

  const statusMut = useMutation({
    mutationFn: (status: string) =>
      mobileApi.patch(`/suppliers/purchase-orders/${poId}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', poId] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e: any) => Alert.alert('Could not update', e?.message ?? 'Please try again.'),
  });

  const grnMut = useMutation({
    mutationFn: (items: ReceiveRow[]) =>
      mobileApi.post(`/suppliers/purchase-orders/${poId}/grn`, { storeId, items }),
    onSuccess: () => {
      setReceiving(false);
      setQty({}); setLot({}); setExpiry({});
      qc.invalidateQueries({ queryKey: ['purchase-order', poId] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      // Receiving writes stock movements — the stock screens are now stale.
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['manage-low-stock'] });
      Alert.alert('Received', 'Stock has been booked in.');
    },
    onError: (e: any) => Alert.alert('Could not record receipt', e?.message ?? 'Please try again.'),
  });

  const po = poQ.data;

  function receiveAll() {
    if (!po) return;
    const next: Record<string, string> = {};
    for (const line of po.items) next[line.id] = String(outstandingQty(line, po.grns));
    setQty(next);
  }

  function submitGrn() {
    if (!po) return;
    const rows: ReceiveRow[] = po.items.map((line) => ({
      poItemId: line.id,
      quantityReceived: parseQty(qty[line.id] ?? ''),
      batchLotNumber: lot[line.id],
      expiryDate: expiry[line.id],
    }));

    const bad = po.items.find((line) => !isValidExpiry(expiry[line.id] ?? ''));
    if (bad) {
      Alert.alert('Check the expiry date', `Use YYYY-MM-DD for ${nameOf(bad.itemId)}, e.g. 2027-03-31.`);
      return;
    }

    const payload = buildGrnPayload(rows);
    if (payload.length === 0) {
      Alert.alert('Nothing to receive', 'Enter how many units arrived for at least one line.');
      return;
    }

    const over = po.items.filter((line) => {
      const entered = parseQty(qty[line.id] ?? '');
      return entered > outstandingQty(line, po.grns);
    });

    const commit = () => grnMut.mutate(payload);
    if (over.length > 0) {
      // Over-delivery is legitimate but worth a second look — it is also the
      // classic typo (120 instead of 12) that quietly inflates stock.
      Alert.alert(
        'More than ordered',
        `${over.length} line${over.length === 1 ? '' : 's'} received above the outstanding quantity. Book it in anyway?`,
        [{ text: 'Check again', style: 'cancel' }, { text: 'Book in', onPress: commit }],
      );
      return;
    }
    commit();
  }

  if (poQ.isLoading || !po) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const st = normalizePoStatus(po.status);
  const progress = poProgress(po);
  const receivable = canReceive(po.status);

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{po.poNumber}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.supplier}>{po.supplier?.name ?? 'Supplier'}</Text>
          <Row label="Status" value={PO_STATUS_LABELS[st]} />
          <Row label="Ordered" value={new Date(po.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })} />
          {po.expectedDelivery && (
            <Row label="Expected" value={new Date(po.expectedDelivery).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })} />
          )}
          <Row label="Received" value={`${progress.unitsReceived} of ${progress.unitsOrdered} units`} />
          <Row label="Order value" value={formatKES(poTotalCents(po))} bold />
          {po.notes ? <Text style={s.notes}>{po.notes}</Text> : null}
        </View>

        {/* Manager approval, when the PO is waiting for it */}
        {st === 'SUBMITTED' && canApprove(role) && (
          <View style={s.actionRow}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: Colors.error + '14' }]}
              onPress={() => statusMut.mutate('CANCELLED')}
              disabled={statusMut.isPending}
            >
              <Text style={[s.actionText, { color: Colors.error }]}>Cancel PO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: Colors.success }]}
              onPress={() => statusMut.mutate('APPROVED')}
              disabled={statusMut.isPending}
            >
              {statusMut.isPending ? <ActivityIndicator color="#FFF" size="small" /> : (
                <Text style={[s.actionText, { color: '#FFF' }]}>Approve</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.sectionTitle}>Lines</Text>
        {po.items.map((line) => {
          const got = receivedQty(line.id, po.grns);
          const left = outstandingQty(line, po.grns);
          return (
            <View key={line.id} style={s.card}>
              <Text style={s.itemName}>{nameOf(line.itemId)}</Text>
              <View style={s.rowBetween}>
                <Text style={s.meta}>
                  {got}/{line.quantityOrdered} received
                  {left > 0 ? ` · ${left} outstanding` : ' · complete'}
                </Text>
                <Text style={s.meta}>{formatKES(line.agreedPriceCents)} ea</Text>
              </View>

              {receiving && (
                <View style={s.receiveBlock}>
                  <Text style={s.label}>Quantity received now</Text>
                  <TextInput
                    style={s.input}
                    value={qty[line.id] ?? ''}
                    onChangeText={(v) => setQty((q) => ({ ...q, [line.id]: v }))}
                    keyboardType="numeric"
                    placeholder={String(left)}
                    placeholderTextColor={Colors.textSecondary}
                  />
                  {/* Batch + expiry only matter where the vertical tracks them. */}
                  {tracksBatches && (
                    <View style={s.batchRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Batch / lot</Text>
                        <TextInput
                          style={s.input}
                          value={lot[line.id] ?? ''}
                          onChangeText={(v) => setLot((l) => ({ ...l, [line.id]: v }))}
                          placeholder="optional"
                          placeholderTextColor={Colors.textSecondary}
                          autoCapitalize="characters"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.label}>Expiry</Text>
                        <TextInput
                          style={s.input}
                          value={expiry[line.id] ?? ''}
                          onChangeText={(v) => setExpiry((e) => ({ ...e, [line.id]: v }))}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={Colors.textSecondary}
                        />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {receivable && !receiving && (
          <TouchableOpacity style={s.primaryBtn} onPress={() => { setReceiving(true); receiveAll(); }}>
            <Ionicons name="download-outline" size={18} color="#FFF" />
            <Text style={s.primaryBtnText}>Receive Delivery</Text>
          </TouchableOpacity>
        )}

        {receiving && (
          <>
            <TouchableOpacity style={s.linkBtn} onPress={receiveAll}>
              <Text style={s.linkText}>Fill every line with the outstanding quantity</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, grnMut.isPending && { opacity: 0.7 }]}
              onPress={submitGrn}
              disabled={grnMut.isPending}
            >
              {grnMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                <><Ionicons name="checkmark" size={18} color="#FFF" /><Text style={s.primaryBtnText}>Book Stock In</Text></>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.linkBtn} onPress={() => { setReceiving(false); setQty({}); }}>
              <Text style={s.linkText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {!receivable && st !== 'RECEIVED' && st !== 'CANCELLED' && (
          <Text style={s.hint}>
            This order must be approved before a delivery can be booked against it.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 4 },
  supplier: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 13, color: Colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  notes: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary },
  receiveBlock: { marginTop: 8, gap: 2 },
  batchRow: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.text, marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  linkBtn: { paddingVertical: 10, alignItems: 'center' },
  linkText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  actionText: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 18 },
});
