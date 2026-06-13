import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { Colors } from '../../constants/theme';

interface XReport {
  totalSales: number;
  totalRevenueCents: number;
  totalTaxCents: number;
  totalDiscountCents: number;
  cashSales: number;
  cashRevenueCents: number;
  mpesaSales: number;
  mpesaRevenueCents: number;
  cardSales: number;
  cardRevenueCents: number;
  otherRevenueCents: number;
  averageTransactionCents: number;
  refundCount?: number;
  refundCents?: number;
}

interface SalesSummary {
  period: string;
  totalSales: number;
  totalRevenueCents: number;
}

type ReportTab = 'today' | 'week' | 'month';

const TAB_LABELS: Record<ReportTab, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

function getDateRange(tab: ReportTab): { startDate: string; endDate: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  if (tab === 'today') {
    return { startDate: end, endDate: end };
  }
  if (tab === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { startDate: start.toISOString().split('T')[0], endDate: end };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startDate: start.toISOString().split('T')[0], endDate: end };
}

export default function ReportsScreen() {
  const { user } = useAuthStore();
  const { businessId, storeId } = useActiveStore();

  const [activeTab, setActiveTab] = useState<ReportTab>('today');

  const { startDate, endDate } = getDateRange(activeTab);

  const { data: xReport, isLoading, refetch, isRefetching } = useQuery<XReport>({
    queryKey: ['x-report', businessId, storeId, startDate, endDate],
    queryFn: () =>
      mobileApi.get<XReport>(
        `/reports/x-report?businessId=${businessId}&storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`
      ),
    staleTime: 60_000,
  });

  const total = xReport?.totalRevenueCents ?? 0;
  const tax = xReport?.totalTaxCents ?? 0;
  const discount = xReport?.totalDiscountCents ?? 0;
  const txCount = xReport?.totalSales ?? 0;
  const avgTx = xReport?.averageTransactionCents ?? 0;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {(Object.keys(TAB_LABELS) as ReportTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {TAB_LABELS[tab]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading report...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
        >
          {/* Date Range */}
          <Text style={styles.dateLabel}>
            {startDate === endDate ? startDate : `${startDate} — ${endDate}`}
          </Text>

          {/* Revenue Card */}
          <View style={[styles.card, styles.revenueCard]}>
            <Text style={styles.revenueLabel}>Total Revenue</Text>
            <Text style={styles.revenueValue}>{formatKES(total)}</Text>
            <Text style={styles.revenueSub}>{txCount} transactions</Text>
          </View>

          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Ionicons name="receipt-outline" size={22} color={Colors.primary} />
              <Text style={styles.metricValue}>{txCount}</Text>
              <Text style={styles.metricLabel}>Sales</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="trending-up" size={22} color={Colors.success} />
              <Text style={styles.metricValue}>{formatKES(avgTx)}</Text>
              <Text style={styles.metricLabel}>Avg. Txn</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="calculator-outline" size={22} color={Colors.warning} />
              <Text style={styles.metricValue}>{formatKES(tax)}</Text>
              <Text style={styles.metricLabel}>Tax (VAT)</Text>
            </View>
            <View style={styles.metricCard}>
              <Ionicons name="pricetag-outline" size={22} color={Colors.indigo} />
              <Text style={styles.metricValue}>{formatKES(discount)}</Text>
              <Text style={styles.metricLabel}>Discounts</Text>
            </View>
          </View>

          {/* Payment Breakdown */}
          <Text style={styles.sectionTitle}>Payment Breakdown</Text>
          <View style={styles.card}>
            <PaymentRow
              label="Cash"
              count={xReport?.cashSales ?? 0}
              amountCents={xReport?.cashRevenueCents ?? 0}
              icon="cash-outline"
              color={Colors.success}
            />
            <View style={styles.divider} />
            <PaymentRow
              label="M-Pesa"
              count={xReport?.mpesaSales ?? 0}
              amountCents={xReport?.mpesaRevenueCents ?? 0}
              icon="phone-portrait-outline"
              color={Colors.primary}
            />
            <View style={styles.divider} />
            <PaymentRow
              label="Card"
              count={xReport?.cardSales ?? 0}
              amountCents={xReport?.cardRevenueCents ?? 0}
              icon="card-outline"
              color={Colors.indigo}
            />
            {(xReport?.otherRevenueCents ?? 0) > 0 && (
              <>
                <View style={styles.divider} />
                <PaymentRow
                  label="Other"
                  count={0}
                  amountCents={xReport?.otherRevenueCents ?? 0}
                  icon="ellipsis-horizontal-circle-outline"
                  color={Colors.textSecondary}
                />
              </>
            )}
          </View>

          {/* Refunds (if any) */}
          {(xReport?.refundCount ?? 0) > 0 && (
            <>
              <Text style={styles.sectionTitle}>Refunds</Text>
              <View style={styles.card}>
                <View style={styles.payRow}>
                  <View style={styles.payLeft}>
                    <View style={[styles.payIcon, { backgroundColor: Colors.error + '15' }]}>
                      <Ionicons name="arrow-undo-outline" size={16} color={Colors.error} />
                    </View>
                    <Text style={styles.payLabel}>Refunds Issued</Text>
                  </View>
                  <View style={styles.payRight}>
                    <Text style={styles.payCount}>{xReport?.refundCount ?? 0} txns</Text>
                    <Text style={[styles.payAmount, { color: Colors.error }]}>
                      -{formatKES(xReport?.refundCents ?? 0)}
                    </Text>
                  </View>
                </View>
              </View>
            </>
          )}

          {/* Net Summary */}
          <Text style={styles.sectionTitle}>Net Summary</Text>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Gross Revenue</Text>
              <Text style={styles.summaryValue}>{formatKES(total)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Tax Collected</Text>
              <Text style={styles.summaryValue}>{formatKES(tax)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Discounts</Text>
              <Text style={[styles.summaryValue, { color: Colors.error }]}>
                -{formatKES(discount)}
              </Text>
            </View>
            <View style={[styles.divider, { marginVertical: 6 }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { fontWeight: '700', color: Colors.text }]}>
                Net (ex-Tax)
              </Text>
              <Text style={[styles.summaryValue, { color: Colors.primary, fontWeight: '800' }]}>
                {formatKES(total - tax - discount)}
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PaymentRow({
  label,
  count,
  amountCents,
  icon,
  color,
}: {
  label: string;
  count: number;
  amountCents: number;
  icon: any;
  color: string;
}) {
  return (
    <View style={styles.payRow}>
      <View style={styles.payLeft}>
        <View style={[styles.payIcon, { backgroundColor: color + '15' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.payLabel}>{label}</Text>
      </View>
      <View style={styles.payRight}>
        {count > 0 && <Text style={styles.payCount}>{count} txns</Text>}
        <Text style={styles.payAmount}>{formatKES(amountCents)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 12,
    paddingBottom: 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: Colors.primary, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { color: Colors.textSecondary, fontSize: 14 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  dateLabel: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  revenueCard: {
    backgroundColor: Colors.primary,
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  revenueLabel: { fontSize: 14, color: '#FFFFFF99', fontWeight: '500' },
  revenueValue: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },
  revenueSub: { fontSize: 13, color: '#FFFFFF99' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  metricValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  metricLabel: { fontSize: 11, color: Colors.textSecondary },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  payLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  payLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  payRight: { alignItems: 'flex-end', gap: 2 },
  payCount: { fontSize: 11, color: Colors.textSecondary },
  payAmount: { fontSize: 14, fontWeight: '700', color: Colors.text },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  summaryLabel: { fontSize: 13, color: Colors.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: '600', color: Colors.text },
});
