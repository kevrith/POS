import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { mobileApi, formatKES } from '../lib/api';
import { Colors } from '../constants/theme';

interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface SaleDetail {
  id: string;
  receiptNumber: string;
  totalCents: number;
  items: SaleItem[];
  customer?: { id: string; name: string };
}

interface Props {
  visible: boolean;
  saleId: string;
  receiptNumber: string;
  totalCents: number;
  businessId: string;
  onSuccess: () => void;
  onClose: () => void;
}

export default function ReturnModal({
  visible, saleId, receiptNumber, totalCents, businessId, onSuccess, onClose,
}: Props) {
  const [returnType, setReturnType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'STORE_CREDIT'>('CASH');
  const [reason, setReason] = useState('');

  const { data: detail, isLoading } = useQuery<SaleDetail>({
    queryKey: ['sale-return-detail', saleId],
    queryFn: () => mobileApi.get<SaleDetail>(`/sales/${saleId}?businessId=${businessId}`),
    enabled: visible && returnType === 'PARTIAL',
  });

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedTotal =
    detail?.items.filter((i) => selectedIds.has(i.id)).reduce((s, i) => s + i.totalCents, 0) ?? 0;
  const refundAmount = returnType === 'FULL' ? totalCents : selectedTotal;
  const canSubmit = reason.trim().length > 0 && (returnType === 'FULL' || selectedIds.size > 0);

  const mutation = useMutation({
    mutationFn: () =>
      mobileApi.post(`/sales/${saleId}/return?businessId=${businessId}`, {
        reason,
        refundMethod,
        returnedItemIds: returnType === 'PARTIAL' ? Array.from(selectedIds) : undefined,
      }),
    onSuccess: () => { onSuccess(); handleClose(); },
  });

  function handleClose() {
    onClose();
    setReturnType('FULL');
    setSelectedIds(new Set());
    setRefundMethod('CASH');
    setReason('');
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="return-down-back" size={20} color={Colors.warning} />
            <Text style={styles.title}>Return Sale</Text>
          </View>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Receipt info */}
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Receipt</Text>
              <Text style={styles.value}>{receiptNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Sale Total</Text>
              <Text style={styles.value}>{formatKES(totalCents)}</Text>
            </View>
            {returnType === 'PARTIAL' && refundAmount > 0 && (
              <View style={[styles.row, styles.refundRow]}>
                <Text style={styles.refundLabel}>Refund Amount</Text>
                <Text style={styles.refundValue}>{formatKES(refundAmount)}</Text>
              </View>
            )}
          </View>

          {/* Return type */}
          <Text style={styles.sectionTitle}>Return Type</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, returnType === 'FULL' && styles.toggleBtnActive]}
              onPress={() => { setReturnType('FULL'); setSelectedIds(new Set()); }}
            >
              <Text style={[styles.toggleText, returnType === 'FULL' && styles.toggleTextActive]}>
                Full Return
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, returnType === 'PARTIAL' && styles.toggleBtnPartial]}
              onPress={() => setReturnType('PARTIAL')}
            >
              <Text style={[styles.toggleText, returnType === 'PARTIAL' && styles.toggleTextActive]}>
                Partial (Select Items)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Item selection */}
          {returnType === 'PARTIAL' && (
            <View style={styles.card}>
              {isLoading ? (
                <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />
              ) : (
                (detail?.items ?? []).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.itemRow, selectedIds.has(item.id) && styles.itemRowSelected]}
                    onPress={() => toggle(item.id)}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.checkbox, selectedIds.has(item.id) && styles.checkboxChecked]}>
                      {selectedIds.has(item.id) && (
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemSub}>
                        {item.quantity}x · {formatKES(item.unitPriceCents)}
                      </Text>
                    </View>
                    <Text style={[styles.itemTotal, selectedIds.has(item.id) && { color: Colors.warning }]}>
                      {formatKES(item.totalCents)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}

          {/* Refund method */}
          <Text style={styles.sectionTitle}>Refund Method</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, refundMethod === 'CASH' && styles.toggleBtnGreen]}
              onPress={() => setRefundMethod('CASH')}
            >
              <Ionicons name="cash-outline" size={16} color={refundMethod === 'CASH' ? '#FFFFFF' : Colors.textSecondary} />
              <Text style={[styles.toggleText, refundMethod === 'CASH' && styles.toggleTextActive]}>Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, refundMethod === 'STORE_CREDIT' && styles.toggleBtnActive]}
              onPress={() => setRefundMethod('STORE_CREDIT')}
            >
              <Ionicons name="card-outline" size={16} color={refundMethod === 'STORE_CREDIT' ? '#FFFFFF' : Colors.textSecondary} />
              <Text style={[styles.toggleText, refundMethod === 'STORE_CREDIT' && styles.toggleTextActive]}>
                Store Credit
              </Text>
            </TouchableOpacity>
          </View>

          {/* Reason */}
          <Text style={styles.sectionTitle}>Reason *</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Defective product, wrong item…"
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {mutation.error && (
            <Text style={styles.errorText}>
              {(mutation.error as Error).message ?? 'Failed to process return'}
            </Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, (!canSubmit || mutation.isPending) && styles.submitBtnDisabled]}
            onPress={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>
                {returnType === 'FULL'
                  ? `Return All · ${formatKES(totalCents)}`
                  : selectedIds.size > 0
                  ? `Return ${selectedIds.size} Item(s) · ${formatKES(selectedTotal)}`
                  : 'Select Items'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF7ED',
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 10, paddingBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 6,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, color: Colors.textSecondary },
  value: { fontSize: 13, fontWeight: '600', color: Colors.text },
  refundRow: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
  refundLabel: { fontSize: 14, fontWeight: '700', color: Colors.warning },
  refundValue: { fontSize: 16, fontWeight: '800', color: Colors.warning },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleBtnPartial: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  toggleBtnGreen: { backgroundColor: Colors.success, borderColor: Colors.success },
  toggleText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: '#FFFFFF' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  itemRowSelected: { backgroundColor: Colors.warning + '10' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.warning, borderColor: Colors.warning },
  itemName: { fontSize: 13, fontWeight: '600', color: Colors.text },
  itemSub: { fontSize: 11, color: Colors.textSecondary },
  itemTotal: { fontSize: 13, fontWeight: '700', color: Colors.text },
  reasonInput: {
    fontSize: 14,
    color: Colors.text,
    minHeight: 72,
    paddingTop: 4,
  },
  errorText: { fontSize: 13, color: Colors.error, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.warning,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
