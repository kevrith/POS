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
import { useActiveStore } from '../../lib/useActiveStore';
import { Colors } from '../../constants/theme';

// Matches the web /reports/sales response (apps/api reports.service.ts)
interface SalesReportResp {
  sales: Array<{ discountCents: number }>;
  summary: {
    totalSales: number;
    totalRevenueCents: number;
    totalVatCents: number;
    totalTotCents: number;
  };
}
interface PayMethod { method: string; totalCents: number; count: number }

type ReportTab = 'today' | 'week' | 'month';

const TAB_LABELS: Record<ReportTab, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
};

/**
 * Same local-day boundaries the web app uses (ReportsPage getDateRange):
 * start at 00:00:00 and end at 23:59:59.999 in the device's timezone, sent as
 * full ISO timestamps. The old version sent bare dates (UTC midnight), so the
 * end bound landed before today's sales and the report read 0.
 */
function getDateRange(tab: ReportTab): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (tab === 'week') start.setDate(now.getDate() - 6);
  if (tab === 'month') start.setDate(1);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
  const label = tab === 'today' ? fmt(now) : `${fmt(start)} — ${fmt(end)}`;
  return { startDate: start.toISOString(), endDate: end.toISOString(), label };
}

export default function ReportsScreen() {
  const { businessId, storeId } = useActiveStore();

  const [activeTab, setActiveTab] = useState<ReportTab>('today');

  const { startDate, endDate, label: dateLabel } = getDateRange(activeTab);
  const qs = `businessId=${businessId}&storeId=${storeId}&startDate=${startDate}&endDate=${endDate}`;

  // Same endpoints the web Reports page uses, so both show identical numbers.
  const { data: report, isLoading, refetch, isRefetching } = useQuery<SalesReportResp>({
    queryKey: ['report-sales', businessId, storeId, startDate, endDate],
    queryFn: () => mobileApi.get<SalesReportResp>(`/reports/sales?${qs}`),
    enabled: !!businessId && !!storeId,
    staleTime: 30_000,
  });

  const { data: payMethods, refetch: refetchPay } = useQuery<PayMethod[]>({
    queryKey: ['report-pay', businessId, storeId, startDate, endDate],
    queryFn: () => mobileApi.get<PayMethod[]>(`/reports/payment-methods?${qs}`),
    enabled: !!businessId && !!storeId,
    staleTime: 30_000,
  });

  const summary = report?.summary;
  const total = summary?.totalRevenueCents ?? 0;
  const txCount = summary?.totalSales ?? 0;
  const tax = (summary?.totalVatCents ?? 0) + (summary?.totalTotCents ?? 0);
  const avgTx = txCount > 0 ? Math.round(total / txCount) : 0;
  const discount = (report?.sales ?? []).reduce((s, x) => s + (x.discountCents ?? 0), 0);

  const payOf = (m: string) => payMethods?.find((p) => p.method === m);
  const cash = payOf('CASH');
  const mpesa = payOf('MPESA');
  const card = payOf('CARD');
  const otherCents = (payMethods ?? [])
    .filter((p) => !['CASH', 'MPESA', 'CARD'].includes(p.method))
    .reduce((s, p) => s + p.totalCents, 0);

  const refresh = () => { void refetch(); void refetchPay(); };

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
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} colors={[Colors.primary]} />}
        >
          {/* Date Range */}
          <Text style={styles.dateLabel}>{dateLabel}</Text>

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
              count={cash?.count ?? 0}
              amountCents={cash?.totalCents ?? 0}
              icon="cash-outline"
              color={Colors.success}
            />
            <View style={styles.divider} />
            <PaymentRow
              label="M-Pesa"
              count={mpesa?.count ?? 0}
              amountCents={mpesa?.totalCents ?? 0}
              icon="phone-portrait-outline"
              color={Colors.primary}
            />
            <View style={styles.divider} />
            <PaymentRow
              label="Card"
              count={card?.count ?? 0}
              amountCents={card?.totalCents ?? 0}
              icon="card-outline"
              color={Colors.indigo}
            />
            {otherCents > 0 && (
              <>
                <View style={styles.divider} />
                <PaymentRow
                  label="Other"
                  count={0}
                  amountCents={otherCents}
                  icon="ellipsis-horizontal-circle-outline"
                  color={Colors.textSecondary}
                />
              </>
            )}
          </View>

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
