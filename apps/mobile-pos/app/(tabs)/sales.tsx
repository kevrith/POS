import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { Colors } from '../../constants/theme';

interface SaleItem {
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface Payment {
  method: string;
  amountCents: number;
  reference?: string;
}

interface Sale {
  id: string;
  receiptNumber: string;
  totalCents: number;
  taxCents: number;
  discountCents: number;
  status: string;
  type: string;
  createdAt: string;
  cashier?: { name: string };
  customer?: { name: string; phone?: string };
  items: SaleItem[];
  payments: Payment[];
}

interface SalesResponse {
  data: Sale[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: Colors.success,
  VOIDED: Colors.error,
  REFUNDED: Colors.warning,
  LAYAWAY: Colors.indigo,
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

export default function SalesScreen() {
  const { user } = useAuthStore();
  const { businessId, storeId } = useActiveStore();

  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const { data, isLoading, refetch, isRefetching } = useQuery<SalesResponse>({
    queryKey: ['sales', businessId, storeId, page],
    queryFn: () =>
      mobileApi.get<SalesResponse>(
        `/sales?businessId=${businessId}&storeId=${storeId}&page=${page}&limit=${LIMIT}`
      ),
    staleTime: 30_000,
  });

  const allSales = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const filteredSales = search.trim()
    ? allSales.filter(
        (s) =>
          s.receiptNumber.toLowerCase().includes(search.toLowerCase()) ||
          (s.customer?.name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : allSales;

  function renderPaymentMethod(method: string): string {
    const MAP: Record<string, string> = {
      CASH: 'Cash',
      MPESA: 'M-Pesa',
      CARD: 'Card',
      SPLIT: 'Split',
      BANK_TRANSFER: 'Bank',
      GIFT_CARD: 'Gift Card',
      ROOM_CHARGE: 'Room',
    };
    return MAP[method] ?? method;
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sales History</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search receipt or customer..."
            placeholderTextColor={Colors.textSecondary}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading sales...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSales}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item: sale }) => (
            <TouchableOpacity style={styles.saleCard} onPress={() => setSelectedSale(sale)} activeOpacity={0.8}>
              <View style={styles.saleRow}>
                <View style={styles.saleLeft}>
                  <Text style={styles.receiptNum}>{sale.receiptNumber}</Text>
                  <Text style={styles.saleDate}>
                    {formatDate(sale.createdAt)} · {formatTime(sale.createdAt)}
                  </Text>
                  {sale.customer ? (
                    <Text style={styles.customerName}>
                      <Ionicons name="person-outline" size={11} color={Colors.textSecondary} /> {sale.customer.name}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.saleRight}>
                  <Text style={styles.saleTotal}>{formatKES(sale.totalCents)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[sale.status] ?? Colors.textSecondary) + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[sale.status] ?? Colors.textSecondary }]}>
                      {sale.status}
                    </Text>
                  </View>
                  <View style={styles.payMethodRow}>
                    {sale.payments.map((p, i) => (
                      <Text key={i} style={styles.payMethod}>{renderPaymentMethod(p.method)}</Text>
                    ))}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="receipt-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No sales found</Text>
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <Ionicons name="chevron-back" size={18} color={page <= 1 ? Colors.border : Colors.primary} />
                </TouchableOpacity>
                <Text style={styles.pageText}>
                  Page {page} of {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? Colors.border : Colors.primary} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {/* Sale Detail Modal */}
      <Modal visible={!!selectedSale} animationType="slide" presentationStyle="pageSheet">
        {selectedSale && (
          <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Receipt #{selectedSale.receiptNumber}</Text>
              <TouchableOpacity onPress={() => setSelectedSale(null)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Status & Date */}
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[selectedSale.status] ?? Colors.textSecondary) + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_COLORS[selectedSale.status] ?? Colors.textSecondary }]}>
                      {selectedSale.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date</Text>
                  <Text style={styles.detailValue}>
                    {formatDate(selectedSale.createdAt)} {formatTime(selectedSale.createdAt)}
                  </Text>
                </View>
                {selectedSale.cashier && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cashier</Text>
                    <Text style={styles.detailValue}>{selectedSale.cashier.name}</Text>
                  </View>
                )}
                {selectedSale.customer && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Customer</Text>
                    <Text style={styles.detailValue}>{selectedSale.customer.name}</Text>
                  </View>
                )}
              </View>

              {/* Items */}
              <Text style={styles.sectionTitle}>Items</Text>
              <View style={styles.detailCard}>
                {selectedSale.items.map((item, i) => (
                  <View key={i} style={[styles.itemRow, i > 0 && styles.itemRowBorder]}>
                    <Text style={styles.itemRowName} numberOfLines={2}>{item.itemName}</Text>
                    <Text style={styles.itemRowQty}>{item.quantity}x</Text>
                    <Text style={styles.itemRowTotal}>{formatKES(item.totalCents)}</Text>
                  </View>
                ))}
              </View>

              {/* Totals */}
              <Text style={styles.sectionTitle}>Summary</Text>
              <View style={styles.detailCard}>
                {selectedSale.discountCents > 0 && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Discount</Text>
                    <Text style={[styles.detailValue, { color: Colors.error }]}>
                      -{formatKES(selectedSale.discountCents)}
                    </Text>
                  </View>
                )}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Tax</Text>
                  <Text style={styles.detailValue}>{formatKES(selectedSale.taxCents)}</Text>
                </View>
                <View style={[styles.detailRow, styles.totalRow]}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>{formatKES(selectedSale.totalCents)}</Text>
                </View>
              </View>

              {/* Payments */}
              <Text style={styles.sectionTitle}>Payment</Text>
              <View style={styles.detailCard}>
                {selectedSale.payments.map((p, i) => (
                  <View key={i} style={[styles.detailRow, i > 0 && styles.itemRowBorder]}>
                    <Text style={styles.detailLabel}>{renderPaymentMethod(p.method)}</Text>
                    <View>
                      <Text style={styles.detailValue}>{formatKES(p.amountCents)}</Text>
                      {p.reference ? (
                        <Text style={styles.refText}>Ref: {p.reference}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingTop: 60,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  list: { padding: 12, gap: 10, paddingBottom: 24 },
  saleCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  saleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  saleLeft: { flex: 1, gap: 3 },
  saleRight: { alignItems: 'flex-end', gap: 4 },
  receiptNum: { fontSize: 14, fontWeight: '700', color: Colors.text },
  saleDate: { fontSize: 12, color: Colors.textSecondary },
  customerName: { fontSize: 12, color: Colors.textSecondary },
  saleTotal: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  payMethodRow: { flexDirection: 'row', gap: 4 },
  payMethod: {
    fontSize: 10,
    color: Colors.textSecondary,
    backgroundColor: Colors.background,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalContent: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  detailCard: {
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
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 13, color: Colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
  refText: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  itemRowName: { flex: 1, fontSize: 13, color: Colors.text },
  itemRowQty: { fontSize: 12, color: Colors.textSecondary, width: 28, textAlign: 'center' },
  itemRowTotal: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 8, marginTop: 4 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: Colors.text },
  totalValue: { fontSize: 17, fontWeight: '800', color: Colors.primary },
});
