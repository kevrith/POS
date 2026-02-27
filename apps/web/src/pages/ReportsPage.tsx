import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  DollarSign, ShoppingBag, TrendingUp, Package, FileText,
  BarChart3, Calendar, Download, RefreshCw, AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────

interface SalesSummary {
  summary: {
    totalSales: number;
    totalRevenueCents: number;
    totalVatCents: number;
    totalTotCents: number;
  };
  sales: Array<{
    id: string;
    receiptNumber: string | null;
    createdAt: string;
    totalCents: number;
    vatCents: number;
    totCents: number;
    subtotalCents: number;
  }>;
}

interface PaymentMethod {
  method: string;
  totalCents: number;
  count: number;
}

interface ProfitLoss {
  revenueCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
}

interface StockValuation {
  totalValueCents: number;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    costPriceCents: number;
    valueCents: number;
  }>;
}

interface VatReport {
  totalVatCents: number;
  totalSalesCents: number;
  sales: Array<{
    receiptNumber: string | null;
    createdAt: string;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
  }>;
}

interface ExpenseReport {
  totalCents: number;
  byCategory: Record<string, number>;
  expenses: Array<{
    id: string;
    category: string;
    description: string;
    amountCents: number;
    createdAt: string;
  }>;
}

interface XReport {
  salesCount: number;
  totalSalesCents: number;
  totalVatCents: number;
  paymentBreakdown: Array<{ method: string; totalCents: number; count: number }>;
  generatedAt: string;
}

type Tab = 'overview' | 'sales' | 'tax' | 'pl' | 'inventory' | 'fiscal' | 'attendance' | 'commissions';
type Range = 'today' | 'week' | 'month' | 'custom';

// ─── Helpers ─────────────────────────────────────────────────

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getDateRange(range: Range, from: string, to: string): { startDate: string; endDate: string } {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (range === 'week') {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  return { startDate: new Date(from).toISOString(), endDate: new Date(to + 'T23:59:59').toISOString() };
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

const RANGE_LABELS: Record<Range, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'This Month',
  custom: 'Custom',
};

// ─── Stat Card ────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className={`${color} p-2.5 rounded-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── CSV Export Utility ───────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows
    .map((row) =>
      row.map((cell) => {
        const s = String(cell ?? '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    )
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main Component ───────────────────────────────────────────

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? 'default';
  const storeId = user?.storeId ?? '';

  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('month');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().substring(0, 10);
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().substring(0, 10));
  const [showZReportModal, setShowZReportModal] = useState(false);
  const [closingBalance, setClosingBalance] = useState('');

  const { startDate, endDate } = getDateRange(range, customFrom, customTo);

  const baseQs = useMemo(() => {
    const p = new URLSearchParams({ businessId });
    if (storeId) p.set('storeId', storeId);
    p.set('startDate', startDate);
    p.set('endDate', endDate);
    return p.toString();
  }, [businessId, storeId, startDate, endDate]);

  const taxQs = useMemo(
    () => new URLSearchParams({ businessId, startDate, endDate }).toString(),
    [businessId, startDate, endDate],
  );

  // ── Queries ───────────────────────────────────────────────────

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesSummary>({
    queryKey: ['report-sales', baseQs],
    queryFn: () => api.get<SalesSummary>(`/reports/sales?${baseQs}`),
    enabled: !!businessId,
  });

  const { data: paymentMethods = [] } = useQuery<PaymentMethod[]>({
    queryKey: ['report-payments', baseQs],
    queryFn: () => api.get<PaymentMethod[]>(`/reports/payment-methods?${baseQs}`),
    enabled: !!businessId,
  });

  const { data: vatData } = useQuery<VatReport>({
    queryKey: ['report-vat', taxQs],
    queryFn: () => api.get<VatReport>(`/reports/vat?${taxQs}`),
    enabled: !!businessId && (tab === 'tax' || tab === 'overview'),
  });

  const { data: plData } = useQuery<ProfitLoss>({
    queryKey: ['report-pl', taxQs],
    queryFn: () => api.get<ProfitLoss>(`/reports/profit-loss?${taxQs}`),
    enabled: !!businessId && (tab === 'pl' || tab === 'overview'),
  });

  const { data: stockData } = useQuery<StockValuation>({
    queryKey: ['report-stock', businessId, storeId],
    queryFn: () =>
      api.get<StockValuation>(
        `/reports/stock-valuation?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}`,
      ),
    enabled: !!businessId && tab === 'inventory',
  });

  const { data: expenseData } = useQuery<ExpenseReport>({
    queryKey: ['report-expenses', baseQs],
    queryFn: () => api.get<ExpenseReport>(`/reports/expenses?${baseQs}`),
    enabled: !!businessId && (tab === 'pl' || tab === 'overview'),
  });

  const { data: xReport, refetch: refetchXReport, isFetching: xLoading } = useQuery<XReport>({
    queryKey: ['x-report', businessId, storeId, user?.id],
    queryFn: () =>
      api.get<XReport>(
        `/reports/x-report?businessId=${businessId}&storeId=${storeId}&cashierId=${user?.id ?? ''}`,
      ),
    enabled: false,
  });

  const { data: attendanceReport = [] } = useQuery<Array<{
    id: string;
    shiftDate: string;
    clockIn: string;
    clockOut?: string;
    isLate: boolean;
    employee?: { user: { name: string; role: string } };
  }>>({
    queryKey: ['report-attendance', businessId, startDate, endDate],
    queryFn: () =>
      api.get(`/reports/attendance?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'attendance',
  });

  const { data: commissionReport = [] } = useQuery<Array<{
    employeeId: string;
    employeeName: string;
    commissionRate: number;
    salesCount: number;
    totalSalesCents: number;
    commissionCents: number;
  }>>({
    queryKey: ['report-commissions', businessId, startDate, endDate],
    queryFn: () =>
      api.get(`/reports/commissions?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'commissions',
  });

  const zReportMutation = useMutation({
    mutationFn: () =>
      api.post<{ zReportNumber: string; totalSalesCents: number }>('/reports/z-report', {
        businessId,
        storeId,
        cashierId: user?.id ?? '',
        closingBalanceCents: Math.round(Number(closingBalance) * 100),
      }),
    onSuccess: () => {
      setShowZReportModal(false);
      setClosingBalance('');
    },
  });

  // ── Derived data ──────────────────────────────────────────────

  const summary = salesData?.summary;
  const avgSale = summary && summary.totalSales > 0
    ? Math.round(summary.totalRevenueCents / summary.totalSales)
    : 0;

  const dailyData = useMemo(() => {
    if (!salesData?.sales) return [];
    const map: Record<string, number> = {};
    for (const sale of salesData.sales) {
      const day = new Date(sale.createdAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
      map[day] = (map[day] ?? 0) + sale.totalCents;
    }
    return Object.entries(map)
      .map(([date, totalCents]) => ({ date, totalKES: totalCents / 100 }))
      .slice(-14);
  }, [salesData?.sales]);

  // ── Tab config ────────────────────────────────────────────────

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'sales', label: 'Sales', icon: ShoppingBag },
    { id: 'tax', label: 'Tax Report', icon: FileText },
    { id: 'pl', label: 'P&L', icon: TrendingUp },
    { id: 'inventory', label: 'Stock', icon: Package },
    { id: 'fiscal', label: 'X / Z Report', icon: DollarSign },
    { id: 'attendance', label: 'Attendance', icon: BarChart3 },
    { id: 'commissions', label: 'Commissions', icon: TrendingUp },
  ];

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>

          {/* Date range selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-gray-400" />
            {(['today', 'week', 'month', 'custom'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  range === r
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="border px-2 py-1.5 rounded-lg text-sm"
                />
                <span className="text-gray-400 text-sm">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="border px-2 py-1.5 rounded-lg text-sm"
                />
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {salesLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading report data…
          </div>
        )}

        {!salesLoading && (
          <>
            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Revenue"
                    value={formatKES(summary?.totalRevenueCents ?? 0)}
                    icon={DollarSign}
                    color="bg-blue-500"
                    sub={`${summary?.totalSales ?? 0} transactions`}
                  />
                  <StatCard
                    label="Avg Sale Value"
                    value={formatKES(avgSale)}
                    icon={TrendingUp}
                    color="bg-green-500"
                  />
                  <StatCard
                    label="VAT Collected"
                    value={formatKES(summary?.totalVatCents ?? 0)}
                    icon={FileText}
                    color="bg-purple-500"
                  />
                  <StatCard
                    label="Net Profit"
                    value={plData ? formatKES(plData.netProfitCents) : '—'}
                    icon={BarChart3}
                    color={plData && plData.netProfitCents >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
                  />
                </div>

                {dailyData.length > 0 && (
                  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800 mb-4">Daily Revenue</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={dailyData} margin={{ left: 0, right: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString('en-KE')}`, 'Revenue']} />
                        <Bar dataKey="totalKES" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {paymentMethods.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h2 className="text-base font-semibold text-gray-800 mb-4">Payment Methods</h2>
                      <div className="space-y-3">
                        {paymentMethods.map((pm, i) => {
                          const total = paymentMethods.reduce((s, p) => s + p.totalCents, 0);
                          const pct = total > 0 ? Math.round((pm.totalCents / total) * 100) : 0;
                          return (
                            <div key={pm.method}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-gray-700">{pm.method}</span>
                                <span className="text-gray-500">
                                  {formatKES(pm.totalCents)} · {pm.count} txns
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h2 className="text-base font-semibold text-gray-800 mb-4">Payment Split</h2>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={paymentMethods}
                            dataKey="totalCents"
                            nameKey="method"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={2}
                          >
                            {paymentMethods.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatKES(v)} />
                          <Legend iconSize={10} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {plData && (
                  <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                    <h2 className="text-base font-semibold text-gray-800 mb-4">P&L Quick View</h2>
                    <div className="space-y-2 max-w-sm">
                      {[
                        { label: 'Revenue', value: plData.revenueCents, color: 'text-green-600' },
                        { label: 'Cost of Goods', value: -plData.cogsCents, color: 'text-red-500' },
                        { label: 'Gross Profit', value: plData.grossProfitCents, color: plData.grossProfitCents >= 0 ? 'text-green-600' : 'text-red-600', bold: true },
                        { label: 'Expenses', value: -plData.expensesCents, color: 'text-red-500' },
                        { label: 'Net Profit', value: plData.netProfitCents, color: plData.netProfitCents >= 0 ? 'text-green-600' : 'text-red-600', bold: true, border: true },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className={`flex justify-between py-2 text-sm ${row.bold ? 'font-bold text-base' : ''} ${row.border ? 'border-t pt-3' : ''}`}
                        >
                          <span className="text-gray-600">{row.label}</span>
                          <span className={row.color}>{formatKES(Math.abs(row.value))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SALES ── */}
            {tab === 'sales' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Transactions" value={summary?.totalSales ?? 0} icon={ShoppingBag} color="bg-blue-500" />
                  <StatCard label="Total Revenue" value={formatKES(summary?.totalRevenueCents ?? 0)} icon={DollarSign} color="bg-green-500" />
                  <StatCard label="Avg Sale" value={formatKES(avgSale)} icon={TrendingUp} color="bg-purple-500" />
                  <StatCard label="VAT Collected" value={formatKES(summary?.totalVatCents ?? 0)} icon={FileText} color="bg-orange-500" />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <h2 className="font-semibold text-gray-800">Payment Method Breakdown</h2>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">Method</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">Transactions</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paymentMethods.map((pm) => {
                        const total = paymentMethods.reduce((s, p) => s + p.totalCents, 0);
                        const pct = total > 0 ? ((pm.totalCents / total) * 100).toFixed(1) : '0.0';
                        return (
                          <tr key={pm.method} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-medium">{pm.method}</td>
                            <td className="px-5 py-3 text-right">{pm.count}</td>
                            <td className="px-5 py-3 text-right font-semibold">{formatKES(pm.totalCents)}</td>
                            <td className="px-5 py-3 text-right text-gray-500">{pct}%</td>
                          </tr>
                        );
                      })}
                      {paymentMethods.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-5 py-8 text-center text-gray-400">No sales data</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">
                      Sales ({salesData?.sales?.length ?? 0})
                    </h2>
                    <button
                      onClick={() => {
                        if (!salesData?.sales?.length) return;
                        downloadCsv(`sales-${startDate}-${endDate}.csv`, [
                          ['Receipt #', 'Date', 'Subtotal (KES)', 'VAT (KES)', 'Total (KES)'],
                          ...salesData.sales.map((s) => [
                            s.receiptNumber ?? '',
                            new Date(s.createdAt).toLocaleString('en-KE'),
                            (s.subtotalCents / 100).toFixed(2),
                            (s.vatCents / 100).toFixed(2),
                            (s.totalCents / 100).toFixed(2),
                          ]),
                        ]);
                      }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Subtotal</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">VAT</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {salesData?.sales?.slice(0, 50).map((sale) => (
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-mono text-xs text-blue-600">{sale.receiptNumber ?? '—'}</td>
                            <td className="px-5 py-3 text-gray-500">
                              {new Date(sale.createdAt).toLocaleString('en-KE', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </td>
                            <td className="px-5 py-3 text-right">{formatKES(sale.subtotalCents)}</td>
                            <td className="px-5 py-3 text-right text-purple-600">{formatKES(sale.vatCents)}</td>
                            <td className="px-5 py-3 text-right font-semibold">{formatKES(sale.totalCents)}</td>
                          </tr>
                        ))}
                        {(!salesData?.sales || salesData.sales.length === 0) && (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                              No sales in this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── TAX ── */}
            {tab === 'tax' && vatData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <StatCard
                    label="Total Sales (VAT incl.)"
                    value={formatKES(vatData.totalSalesCents)}
                    icon={DollarSign}
                    color="bg-blue-500"
                  />
                  <StatCard
                    label="VAT Collected (16%)"
                    value={formatKES(vatData.totalVatCents)}
                    icon={FileText}
                    color="bg-purple-500"
                  />
                  <StatCard
                    label="Net of VAT"
                    value={formatKES(vatData.totalSalesCents - vatData.totalVatCents)}
                    icon={TrendingUp}
                    color="bg-green-500"
                  />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">VAT Register</h2>
                    <button
                      onClick={() => {
                        if (!vatData?.sales?.length) return;
                        downloadCsv(`vat-register-${startDate}-${endDate}.csv`, [
                          ['Receipt #', 'Date', 'Net (KES)', 'VAT (KES)', 'Total (KES)'],
                          ...vatData.sales.map((s) => [
                            s.receiptNumber ?? '',
                            new Date(s.createdAt).toLocaleDateString('en-KE'),
                            ((s.subtotalCents) / 100).toFixed(2),
                            (s.vatCents / 100).toFixed(2),
                            (s.totalCents / 100).toFixed(2),
                          ]),
                        ]);
                      }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Net Amount</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">VAT (16%)</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {vatData.sales?.slice(0, 100).map((sale, i) => (
                          <tr key={sale.receiptNumber ?? i} className="hover:bg-gray-50">
                            <td className="px-5 py-3 font-mono text-xs text-blue-600">{sale.receiptNumber ?? '—'}</td>
                            <td className="px-5 py-3 text-gray-500">
                              {new Date(sale.createdAt).toLocaleDateString('en-KE')}
                            </td>
                            <td className="px-5 py-3 text-right">{formatKES(sale.subtotalCents)}</td>
                            <td className="px-5 py-3 text-right text-purple-600 font-medium">{formatKES(sale.vatCents)}</td>
                            <td className="px-5 py-3 text-right font-semibold">{formatKES(sale.totalCents)}</td>
                          </tr>
                        ))}
                        {(!vatData.sales || vatData.sales.length === 0) && (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                              No VAT records in this period
                            </td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                        <tr>
                          <td colSpan={2} className="px-5 py-3">TOTAL</td>
                          <td className="px-5 py-3 text-right">
                            {formatKES(vatData.totalSalesCents - vatData.totalVatCents)}
                          </td>
                          <td className="px-5 py-3 text-right text-purple-600">
                            {formatKES(vatData.totalVatCents)}
                          </td>
                          <td className="px-5 py-3 text-right">{formatKES(vatData.totalSalesCents)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── P&L ── */}
            {tab === 'pl' && (
              <div className="space-y-4">
                {plData && (
                  <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b flex justify-between items-center">
                      <h2 className="font-semibold text-gray-800">Profit & Loss Statement</h2>
                      <button
                        onClick={() => {
                          if (!plData) return;
                          downloadCsv(`profit-loss-${startDate}-${endDate}.csv`, [
                            ['Line Item', 'Amount (KES)'],
                            ['Revenue', (plData.revenueCents / 100).toFixed(2)],
                            ['Cost of Goods Sold', (-plData.cogsCents / 100).toFixed(2)],
                            ['Gross Profit', (plData.grossProfitCents / 100).toFixed(2)],
                            ['Expenses', (-plData.expensesCents / 100).toFixed(2)],
                            ['Net Profit', (plData.netProfitCents / 100).toFixed(2)],
                          ]);
                        }}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Download className="w-4 h-4" />
                        Export CSV
                      </button>
                    </div>
                    <div className="px-6 py-4 space-y-1">
                      {[
                        { label: 'Revenue', value: plData.revenueCents, color: 'text-green-600', border: false, bold: false },
                        { label: 'Cost of Goods Sold (COGS)', value: plData.cogsCents, negative: true, color: 'text-red-500', border: false, bold: false },
                        { label: 'Gross Profit', value: plData.grossProfitCents, color: plData.grossProfitCents >= 0 ? 'text-green-600' : 'text-red-600', border: true, bold: true },
                        { label: 'Operating Expenses', value: plData.expensesCents, negative: true, color: 'text-red-500', border: false, bold: false },
                        { label: 'Net Profit', value: plData.netProfitCents, color: plData.netProfitCents >= 0 ? 'text-green-600' : 'text-red-600', border: true, bold: true },
                      ].map((row) => (
                        <div
                          key={row.label}
                          className={`flex justify-between py-3 ${row.bold ? 'font-bold text-base' : 'text-sm'} ${row.border ? 'border-t mt-1' : ''}`}
                        >
                          <span className={row.bold ? 'text-gray-900' : 'text-gray-600 pl-4'}>{row.label}</span>
                          <span className={row.color}>
                            {row.negative ? '(' : ''}
                            {formatKES(Math.abs(row.value))}
                            {row.negative ? ')' : ''}
                          </span>
                        </div>
                      ))}
                      {plData.revenueCents > 0 && (
                        <p className="text-sm text-gray-400 text-right pt-2">
                          Margin: {((plData.netProfitCents / plData.revenueCents) * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {expenseData && expenseData.byCategory && Object.keys(expenseData.byCategory).length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h2 className="font-semibold text-gray-800">
                        Expenses by Category · {formatKES(expenseData.totalCents)}
                      </h2>
                    </div>
                    <div className="p-5 space-y-3">
                      {Object.entries(expenseData.byCategory)
                        .sort(([, a], [, b]) => b - a)
                        .map(([cat, amt], i) => {
                          const pct = expenseData.totalCents > 0 ? (amt / expenseData.totalCents) * 100 : 0;
                          return (
                            <div key={cat}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium text-gray-700">{cat}</span>
                                <span className="text-gray-500">
                                  {formatKES(amt)} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── INVENTORY ── */}
            {tab === 'inventory' && (
              <div className="space-y-4">
                {stockData ? (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <StatCard
                        label="Total Stock Value (Cost)"
                        value={formatKES(stockData.totalValueCents)}
                        icon={Package}
                        color="bg-blue-500"
                        sub={`${stockData.items?.length ?? 0} products`}
                      />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Stock Valuation</h2>
                        <button
                          onClick={() => {
                            if (!stockData?.items?.length) return;
                            downloadCsv(`stock-valuation-${new Date().toISOString().substring(0, 10)}.csv`, [
                              ['Item Name', 'Qty', 'Cost Price (KES)', 'Total Value (KES)'],
                              ...stockData.items.map((i) => [
                                i.name,
                                String(i.quantity),
                                (i.costPriceCents / 100).toFixed(2),
                                (i.valueCents / 100).toFixed(2),
                              ]),
                              ['TOTAL', '', '', (stockData.totalValueCents / 100).toFixed(2)],
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" />
                          Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Item</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Qty</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Cost/Unit</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Total Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {stockData.items?.map((item) => (
                              <tr key={item.itemId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium">{item.name}</td>
                                <td className="px-5 py-3 text-right">{item.quantity.toLocaleString()}</td>
                                <td className="px-5 py-3 text-right">{formatKES(item.costPriceCents)}</td>
                                <td className="px-5 py-3 text-right font-semibold">{formatKES(item.valueCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 font-bold">
                            <tr>
                              <td colSpan={3} className="px-5 py-3">TOTAL</td>
                              <td className="px-5 py-3 text-right">{formatKES(stockData.totalValueCents)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    Loading stock data…
                  </div>
                )}
              </div>
            )}

            {/* ── ATTENDANCE REPORT ── */}
            {tab === 'attendance' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Records"
                    value={attendanceReport.length}
                    icon={BarChart3}
                    color="bg-blue-500"
                  />
                  <StatCard
                    label="On Time"
                    value={attendanceReport.filter((r) => !r.isLate).length}
                    icon={BarChart3}
                    color="bg-green-500"
                  />
                  <StatCard
                    label="Late Arrivals"
                    value={attendanceReport.filter((r) => r.isLate).length}
                    icon={BarChart3}
                    color="bg-red-500"
                  />
                  <StatCard
                    label="Completed Shifts"
                    value={attendanceReport.filter((r) => r.clockOut).length}
                    icon={BarChart3}
                    color="bg-purple-500"
                  />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Attendance Records ({attendanceReport.length})</h2>
                    <button
                      onClick={() => {
                        if (!attendanceReport.length) return;
                        downloadCsv(`attendance-${startDate}-${endDate}.csv`, [
                          ['Employee', 'Role', 'Date', 'Clock In', 'Clock Out', 'Status'],
                          ...attendanceReport.map((r) => [
                            r.employee?.user.name ?? r.id.slice(0, 8),
                            r.employee?.user.role ?? '',
                            new Date(r.shiftDate).toLocaleDateString('en-KE'),
                            new Date(r.clockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
                            r.clockOut ? new Date(r.clockOut).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '',
                            r.isLate ? 'Late' : 'On Time',
                          ]),
                        ]);
                      }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Employee</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Clock In</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Clock Out</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {attendanceReport.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No records in this period</td>
                          </tr>
                        ) : (
                          attendanceReport.slice(0, 100).map((r) => (
                            <tr key={r.id} className="hover:bg-gray-50">
                              <td className="px-5 py-3">
                                <div className="font-medium">{r.employee?.user.name ?? r.id.slice(0, 8)}</div>
                                <div className="text-xs text-gray-400">{r.employee?.user.role ?? ''}</div>
                              </td>
                              <td className="px-5 py-3 text-gray-500">
                                {new Date(r.shiftDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                              </td>
                              <td className="px-5 py-3 text-right font-mono">
                                {new Date(r.clockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-5 py-3 text-right font-mono text-gray-500">
                                {r.clockOut
                                  ? new Date(r.clockOut).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                                  : <span className="text-green-600 text-xs font-semibold">Active</span>
                                }
                              </td>
                              <td className="px-5 py-3 text-center">
                                {r.isLate
                                  ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Late</span>
                                  : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">On Time</span>
                                }
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── COMMISSIONS REPORT ── */}
            {tab === 'commissions' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Total Commissions"
                    value={formatKES(commissionReport.reduce((s, c) => s + c.commissionCents, 0))}
                    icon={TrendingUp}
                    color="bg-green-500"
                  />
                  <StatCard
                    label="Total Sales"
                    value={formatKES(commissionReport.reduce((s, c) => s + c.totalSalesCents, 0))}
                    icon={DollarSign}
                    color="bg-blue-500"
                  />
                  <StatCard
                    label="Employees"
                    value={commissionReport.length}
                    icon={BarChart3}
                    color="bg-purple-500"
                  />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Commission Summary</h2>
                    <button
                      onClick={() => {
                        if (!commissionReport.length) return;
                        downloadCsv(`commissions-${startDate}-${endDate}.csv`, [
                          ['Employee', 'Commission Rate', 'Sales Count', 'Total Sales (KES)', 'Commission Earned (KES)'],
                          ...commissionReport.map((c) => [
                            c.employeeName,
                            `${c.commissionRate}%`,
                            String(c.salesCount),
                            (c.totalSalesCents / 100).toFixed(2),
                            (c.commissionCents / 100).toFixed(2),
                          ]),
                        ]);
                      }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" />
                      Export CSV
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">Employee</th>
                        <th className="text-center px-5 py-3 font-medium text-gray-600">Rate</th>
                        <th className="text-center px-5 py-3 font-medium text-gray-600">Sales</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">Total Sales</th>
                        <th className="text-right px-5 py-3 font-medium text-gray-600">Commission</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {commissionReport.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No commission data for this period</td>
                        </tr>
                      ) : (
                        commissionReport
                          .sort((a, b) => b.commissionCents - a.commissionCents)
                          .map((c) => (
                            <tr key={c.employeeId} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-medium">{c.employeeName}</td>
                              <td className="px-5 py-3 text-center">{c.commissionRate}%</td>
                              <td className="px-5 py-3 text-center">{c.salesCount}</td>
                              <td className="px-5 py-3 text-right">{formatKES(c.totalSalesCents)}</td>
                              <td className="px-5 py-3 text-right font-bold text-green-700">{formatKES(c.commissionCents)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                    {commissionReport.length > 0 && (
                      <tfoot className="bg-gray-50 font-bold">
                        <tr>
                          <td colSpan={4} className="px-5 py-3">TOTAL</td>
                          <td className="px-5 py-3 text-right text-green-700">
                            {formatKES(commissionReport.reduce((s, c) => s + c.commissionCents, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* ── FISCAL ── */}
            {tab === 'fiscal' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* X-Report */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="px-5 py-4 border-b">
                      <h2 className="font-semibold text-gray-800">X-Report (Snapshot)</h2>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Current session totals — does NOT close the day
                      </p>
                    </div>
                    <div className="p-5">
                      {xReport ? (
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Transactions</span>
                            <span className="font-semibold">{xReport.salesCount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Sales</span>
                            <span className="font-semibold">{formatKES(xReport.totalSalesCents)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">VAT</span>
                            <span className="font-semibold text-purple-600">{formatKES(xReport.totalVatCents)}</span>
                          </div>
                          {xReport.paymentBreakdown.length > 0 && (
                            <div className="border-t pt-3">
                              <p className="text-xs text-gray-400 font-semibold uppercase mb-2">
                                By Payment Method
                              </p>
                              {xReport.paymentBreakdown.map((pm) => (
                                <div key={pm.method} className="flex justify-between py-1">
                                  <span className="text-gray-600">{pm.method}</span>
                                  <span>{formatKES(pm.totalCents)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-400 pt-2">
                            Generated: {new Date(xReport.generatedAt).toLocaleString('en-KE')}
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <p className="text-gray-500 text-sm mb-4">
                            Click to generate current session snapshot
                          </p>
                          <button
                            onClick={() => void refetchXReport()}
                            disabled={xLoading}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                          >
                            {xLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
                            Generate X-Report
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Z-Report */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="px-5 py-4 border-b">
                      <h2 className="font-semibold text-gray-800">Z-Report (End of Day)</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Closes the business day — run at end of shift</p>
                    </div>
                    <div className="p-5">
                      <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg mb-4">
                        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          Z-Report closes the current business day and resets daily counters. Run only at end of business day.
                        </p>
                      </div>
                      <button
                        onClick={() => setShowZReportModal(true)}
                        className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                      >
                        Run Z-Report (End of Day)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Z-Report Modal */}
      {showZReportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Run Z-Report</h2>
              <p className="text-sm text-gray-500 mt-1">Enter the physical cash counted in the drawer</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Closing Cash Balance (KES)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={closingBalance}
                  onChange={(e) => setClosingBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-2.5 text-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              {zReportMutation.isSuccess && (
                <div className="p-3 bg-green-50 rounded-lg text-sm text-green-700">
                  Z-Report generated successfully. Day has been closed.
                </div>
              )}
              {zReportMutation.isError && (
                <p className="text-sm text-red-600">{(zReportMutation.error as Error).message}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => {
                  setShowZReportModal(false);
                  setClosingBalance('');
                }}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => zReportMutation.mutate()}
                disabled={!closingBalance || zReportMutation.isPending}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {zReportMutation.isPending ? 'Running…' : 'Run Z-Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
