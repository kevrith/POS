import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  DollarSign, ShoppingBag, TrendingUp, Package, FileText,
  BarChart3, Calendar, Download, RefreshCw, AlertCircle,
  ChefHat, Truck, Layers, CreditCard, History, BookOpen,
  ClipboardList, Hash, Flag, Shield, AlertTriangle, DatabaseBackup,
  Users, Smartphone, X, Pencil, Printer,
} from 'lucide-react';
import { api, openPdfReport } from '../lib/api';
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
    discountCents: number;
    serviceChargeCents: number;
    etimsSubmitted?: boolean;
    etimsControlNumber?: string | null;
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
  totalNetCents?: number;
  sales: Array<{
    receiptNumber: string | null;
    createdAt: string;
    subtotalCents: number;
    discountCents: number;
    vatCents: number;
    netCents: number;
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

interface RecipeVarianceRow {
  ingredientName: string;
  plannedGrams: number;
  actualGrams: number;
  varianceGrams: number;
  variancePct: number;
}

interface BundleProfitabilityRow {
  bundleId: string;
  bundleName: string;
  sold: number;
  revenueCents: number;
  totalCostCents: number;
  profitCents: number;
  marginPct: number;
}

interface SupplierLedgerRow {
  supplierId: string;
  supplierName: string;
  poCount: number;
  totalValueCents: number;
  pendingCount: number;
  receivedCount: number;
}

interface SupplierPerformanceRow {
  supplierId: string;
  supplierName: string;
  onTimeRate: number;
  avgLeadTimeDays: number;
  fillRate: number;
}

interface SupplierAgeingRow {
  supplierId: string;
  supplierName: string;
  contact: string;
  paymentTerms?: string;
  totalOutstandingCents: number;
  currentCents: number;
  days1to30Cents: number;
  days31to60Cents: number;
  days61to90Cents: number;
  days90plusCents: number;
  overdueOrderCount: number;
  totalOrderCount: number;
}

interface SupplierAgeingData {
  rows: SupplierAgeingRow[];
  summary: {
    totalSuppliers: number;
    totalOutstandingCents: number;
    currentCents: number;
    days1to30Cents: number;
    days31to60Cents: number;
    days61to90Cents: number;
    days90plusCents: number;
  };
  asOfDate: string;
}

interface CreditBookData {
  rows: Array<{
    saleId: string;
    receiptNumber: string | null;
    date: string;
    customerName: string;
    customerPhone?: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    daysSince: number;
    agingBucket: string;
  }>;
  summary: {
    totalOutstandingCents: number;
    uniqueDebtors: number;
    totalCreditSales: number;
  };
}

type Tab = 'overview' | 'sales' | 'item-summary' | 'tax' | 'pl' | 'inventory' | 'fiscal' | 'attendance' | 'commissions' | 'employee-sales' | 'recipes' | 'bundles' | 'suppliers' | 'supplier-ageing' | 'credit' | 'stock-history' | 'layaway' | 'proforma' | 'serials' | 'kra' | 'audit' | 'grn' | 'export';
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

// ─── Print Utility ────────────────────────────────────────────

function printHtml(title: string, bodyHtml: string): void {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/><title>${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:20px 30px}
  h1{font-size:16pt;margin-bottom:2px}
  .sub{font-size:9pt;color:#666;margin-bottom:12px}
  h2{font-size:12pt;background:#f0f0f0;padding:5px 8px;margin:14px 0 4px;border-left:4px solid #2563eb}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  th{text-align:left;padding:5px 8px;border-bottom:2px solid #ccc;font-size:9pt;white-space:nowrap}
  th.r,td.r{text-align:right}
  td{padding:4px 8px;border-bottom:1px solid #eee;font-size:10pt}
  tfoot td{font-weight:bold;border-top:2px solid #ccc;border-bottom:none}
  .grand{font-size:12pt;font-weight:bold;padding:10px 8px;border-top:3px solid #2563eb;margin-top:8px}
  @media print{@page{margin:15mm}}
</style>
</head><body>
${bodyHtml}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`);
  w.document.close();
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
  const [empSalesFilter, setEmpSalesFilter] = useState('');
  const [salesViewMode, setSalesViewMode] = useState<'transactions' | 'by-date'>('by-date');
  const [expandedSaleDate, setExpandedSaleDate] = useState<string | null>(null);
  const [writeOffItem, setWriteOffItem] = useState<{ itemId: string; name: string; qty: number } | null>(null);
  const [writeOffQty, setWriteOffQty] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('WRITE_OFF');
  const [writeOffNotes, setWriteOffNotes] = useState('');
  const [historyAsOf, setHistoryAsOf] = useState(() => new Date().toISOString().substring(0, 10));
  const [layawayStatus, setLayawayStatus] = useState('');

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

  const {
    data: salesData,
    isLoading: salesLoading,
    isFetching: salesFetching,
    dataUpdatedAt: salesUpdatedAt,
    refetch: refetchSales,
  } = useQuery<SalesSummary>({
    queryKey: ['report-sales', baseQs],
    queryFn: () => api.get<SalesSummary>(`/reports/sales?${baseQs}`),
    enabled: !!businessId,
    staleTime: 0,                   // always consider stale → refetch on focus/nav
    refetchInterval: 10_000,        // poll every 10 s while tab is open
    refetchIntervalInBackground: false,
  });

  const { data: paymentMethods = [], refetch: refetchPayments } = useQuery<PaymentMethod[]>({
    queryKey: ['report-payments', baseQs],
    queryFn: () => api.get<PaymentMethod[]>(`/reports/payment-methods?${baseQs}`),
    enabled: !!businessId,
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const { data: vatData, refetch: refetchVat } = useQuery<VatReport>({
    queryKey: ['report-vat', taxQs],
    queryFn: () => api.get<VatReport>(`/reports/vat?${taxQs}`),
    enabled: !!businessId && (tab === 'tax' || tab === 'overview'),
    staleTime: 0,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });

  const { data: plData } = useQuery<ProfitLoss>({
    queryKey: ['report-pl', taxQs],
    queryFn: () => api.get<ProfitLoss>(`/reports/profit-loss?${taxQs}`),
    enabled: !!businessId && (tab === 'pl' || tab === 'overview'),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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
    commissionBasis: string;
    salesCount: number;
    totalSalesCents: number;
    commissionCents: number;
  }>>({
    queryKey: ['report-commissions', businessId, startDate, endDate],
    queryFn: () =>
      api.get(`/reports/commissions?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'commissions',
  });

  const { data: recipeVariance = [] } = useQuery<RecipeVarianceRow[]>({
    queryKey: ['report-recipe-variance', businessId, startDate, endDate],
    queryFn: () =>
      api.get<RecipeVarianceRow[]>(`/reports/recipe-variance?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'recipes',
  });

  const { data: bundleProfitability = [] } = useQuery<BundleProfitabilityRow[]>({
    queryKey: ['report-bundle-profitability', businessId, startDate, endDate],
    queryFn: () =>
      api.get<BundleProfitabilityRow[]>(`/reports/bundle-profitability?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'bundles',
  });

  const { data: supplierLedger = [] } = useQuery<SupplierLedgerRow[]>({
    queryKey: ['report-supplier-ledger', businessId, startDate, endDate],
    queryFn: () =>
      api.get<SupplierLedgerRow[]>(`/reports/supplier-ledger?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'suppliers',
  });

  const { data: supplierPerformance = [] } = useQuery<SupplierPerformanceRow[]>({
    queryKey: ['report-supplier-performance', businessId, startDate, endDate],
    queryFn: () =>
      api.get<SupplierPerformanceRow[]>(`/reports/supplier-performance?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'suppliers',
  });

  const { data: supplierAgeing } = useQuery<SupplierAgeingData>({
    queryKey: ['report-supplier-ageing', businessId],
    queryFn: () => api.get<SupplierAgeingData>(`/reports/supplier-ageing?businessId=${businessId}`),
    enabled: !!businessId && tab === 'supplier-ageing',
  });

  const { data: creditBook } = useQuery<CreditBookData>({
    queryKey: ['report-credit-book', businessId, storeId, startDate, endDate],
    queryFn: () =>
      api.get<CreditBookData>(
        `/reports/credit-book?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}&startDate=${startDate}&endDate=${endDate}`,
      ),
    enabled: !!businessId && tab === 'credit',
  });

  const { data: historicalStock } = useQuery<{
    asOfDate: string;
    items: Array<{ itemId: string; name: string; category: string; barcode: string; quantity: number; costPriceCents: number; valueCents: number }>;
    totalValueCents: number;
    totalItems: number;
  }>({
    queryKey: ['report-historical-stock', businessId, storeId, historyAsOf],
    queryFn: () => api.get(`/reports/historical-stock?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}&asOfDate=${new Date(historyAsOf).toISOString()}`),
    enabled: !!businessId && tab === 'stock-history',
  });

  const { data: layawayBook } = useQuery<{
    rows: Array<{ id: string; customerName: string; customerPhone: string; status: string; totalCents: number; paidCents: number; remainingCents: number; paymentCount: number; createdAt: string; daysSinceCreated: number; receiptNumber: string | null }>;
    summary: { totalValueCents: number; totalPaidCents: number; totalRemainingCents: number; activeCount: number; completedCount: number; count: number };
  }>({
    queryKey: ['report-layaway-book', businessId, storeId, startDate, endDate, layawayStatus],
    queryFn: () => api.get(`/reports/layaway-book?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}&startDate=${startDate}&endDate=${endDate}${layawayStatus ? `&status=${layawayStatus}` : ''}`),
    enabled: !!businessId && tab === 'layaway',
  });

  const { data: proformaPipeline } = useQuery<{
    rows: Array<{ id: string; receiptNumber: string | null; status: string; customerName: string; customerPhone: string; totalCents: number; itemCount: number; createdAt: string; validUntil: string | null; daysRemaining: number | null; isExpired: boolean; isUrgent: boolean }>;
    summary: { total: number; active: number; expired: number; converted: number; totalValueCents: number; pipelineValueCents: number };
  }>({
    queryKey: ['report-proforma-pipeline', businessId, storeId],
    queryFn: () => api.get(`/reports/proforma-pipeline?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}`),
    enabled: !!businessId && tab === 'proforma',
  });

  const { data: serialRegistry } = useQuery<{
    rows: Array<{ id: string; serialNumber: string; status: string; itemId: string; itemName: string; category: string; saleReceiptNumber: string | null; soldAt: string | null; customerName: string | null; createdAt: string }>;
    summary: { total: number; available: number; sold: number; reserved: number };
  }>({
    queryKey: ['report-serial-registry', businessId, storeId],
    queryFn: () => api.get(`/reports/serial-registry?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}`),
    enabled: !!businessId && tab === 'serials',
  });

  const { data: grnDiscrepancy } = useQuery<{
    rows: Array<{ grnId: string; receivedAt: string; poNumber: string; supplierName: string; quantityOrdered: number; quantityReceived: number; variance: number; variancePct: number; hasDiscrepancy: boolean; discrepancyType: string; batchLotNumber: string | null; varianceValueCents: number }>;
    summary: { totalLines: number; discrepancyCount: number; shortDeliveries: number; overDeliveries: number; totalVarianceValueCents: number; discrepancyRate: number };
  }>({
    queryKey: ['report-grn-discrepancy', businessId, startDate, endDate],
    queryFn: () => api.get(`/reports/grn-discrepancy?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: !!businessId && tab === 'grn',
  });

  const { data: employeeSalesData } = useQuery<{
    rows: Array<{
      employeeId: string;
      employeeName: string;
      role: string;
      salesCount: number;
      totalCents: number;
      categories: Array<{ name: string; subtotalCents: number; items: Array<{ itemName: string; qty: number; totalCents: number }> }>;
      mpesaPayments: Array<{ saleReceiptNumber: string | null; amountCents: number; mpesaRef: string | null; createdAt: string }>;
      mpesaTotalCents: number;
    }>;
    summary: { totalEmployees: number; totalSales: number; totalRevenueCents: number; totalMpesaCents: number };
  }>({
    queryKey: ['report-employee-sales', businessId, storeId, startDate, endDate, empSalesFilter],
    queryFn: () =>
      api.get(
        `/reports/employee-sales?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}` +
        `&startDate=${startDate}&endDate=${endDate}` +
        (empSalesFilter ? `&employeeId=${empSalesFilter}` : ''),
      ),
    enabled: !!businessId && tab === 'employee-sales',
  });

  const { data: businessUsers = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['business-users', businessId],
    queryFn: () => api.get<Array<{ id: string; name: string; role: string }>>(`/business/${businessId}/users`),
    enabled: !!businessId && tab === 'employee-sales',
  });

  const { data: itemSummaryData } = useQuery<{
    categories: Array<{
      name: string;
      totalCents: number;
      totalQty: number;
      items: Array<{ name: string; qty: number; totalCents: number }>;
    }>;
    grandTotalCents: number;
    grandTotalQty: number;
  }>({
    queryKey: ['report-item-summary', businessId, storeId, startDate, endDate],
    queryFn: () =>
      api.get(
        `/reports/item-summary?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}&startDate=${startDate}&endDate=${endDate}`,
      ),
    enabled: !!businessId && tab === 'item-summary',
  });

  const writeOffMutation = useMutation({
    mutationFn: (vars: { itemId: string; qty: number; reason: string; notes: string }) =>
      api.post('/inventory/adjustment', {
        itemId: vars.itemId,
        storeId,
        quantity: -vars.qty,
        type: vars.reason,
        notes: vars.notes,
        businessId,
      }),
    onSuccess: () => {
      setWriteOffItem(null);
      setWriteOffQty('');
      setWriteOffNotes('');
    },
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
    { id: 'item-summary', label: 'Item Summary', icon: Package },
    { id: 'tax', label: 'Tax Report', icon: FileText },
    { id: 'pl', label: 'P&L', icon: TrendingUp },
    { id: 'inventory', label: 'Stock', icon: Package },
    { id: 'fiscal', label: 'X / Z Report', icon: DollarSign },
    { id: 'attendance', label: 'Attendance', icon: BarChart3 },
    { id: 'commissions', label: 'Commissions', icon: TrendingUp },
    { id: 'employee-sales', label: 'Employee Sales', icon: Users },
    { id: 'recipes', label: 'Recipe Variance', icon: ChefHat },
    { id: 'bundles', label: 'Bundles', icon: Layers },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'supplier-ageing', label: 'Supplier Ageing', icon: Truck },
    { id: 'credit', label: 'Credit Book', icon: CreditCard },
    { id: 'stock-history', label: 'Stock History', icon: History },
    { id: 'layaway', label: 'Layaway Book', icon: BookOpen },
    { id: 'proforma', label: 'Proforma Pipeline', icon: ClipboardList },
    { id: 'serials', label: 'Serial Registry', icon: Hash },
    { id: 'grn', label: 'GRN Discrepancy', icon: AlertTriangle },
    { id: 'kra', label: 'KRA Export', icon: Flag },
    { id: 'audit', label: 'Audit Log', icon: Shield },
    { id: 'export', label: 'Full Export', icon: DatabaseBackup },
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
                  <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="font-semibold text-gray-800">
                        Sales ({salesData?.sales?.length ?? 0})
                      </h2>
                      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                        <button
                          onClick={() => setSalesViewMode('by-date')}
                          className={`px-3 py-1 ${salesViewMode === 'by-date' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          By Date
                        </button>
                        <button
                          onClick={() => setSalesViewMode('transactions')}
                          className={`px-3 py-1 border-l ${salesViewMode === 'transactions' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                          All Transactions
                        </button>
                      </div>
                      {/* Live indicator */}
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <span className={`inline-block w-2 h-2 rounded-full ${salesFetching ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
                        {salesFetching ? 'Updating…' : salesUpdatedAt
                          ? `Updated ${Math.round((Date.now() - salesUpdatedAt) / 1000)}s ago`
                          : 'Live'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => { void refetchSales(); void refetchPayments(); void refetchVat(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                        title="Refresh now"
                      >
                        <RefreshCw size={13} className={salesFetching ? 'animate-spin' : ''} />
                        Refresh
                      </button>
                      <button
                        onClick={() => {
                          if (!salesData?.sales?.length) return;
                          const byDate: Record<string, NonNullable<typeof salesData>['sales']> = {};
                          for (const s of salesData.sales) {
                            const d = new Date(s.createdAt).toLocaleDateString('en-KE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                            if (!byDate[d]) byDate[d] = [];
                            byDate[d].push(s);
                          }
                          const rows = Object.entries(byDate).map(([date, daySales]) => {
                            const dayTotal = daySales.reduce((s, x) => s + x.totalCents, 0);
                            const dayVat = daySales.reduce((s, x) => s + x.vatCents, 0);
                            const dayNet = daySales.reduce((s, x) => s + (x.subtotalCents - x.vatCents), 0);
                            return `<h2>${date} &mdash; ${daySales.length} sales &mdash; ${formatKES(dayTotal)}</h2>
                            <table><thead><tr><th>Receipt #</th><th>Time</th><th class="r">Net (ex-VAT)</th><th class="r">VAT (incl.)</th><th class="r">Total</th></tr></thead><tbody>
                            ${daySales.map((s) => `<tr><td>${s.receiptNumber ?? '—'}</td><td>${new Date(s.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</td><td class="r">${formatKES(s.subtotalCents - s.vatCents)}</td><td class="r">${formatKES(s.vatCents)}</td><td class="r">${formatKES(s.totalCents)}</td></tr>`).join('')}
                            </tbody><tfoot><tr><td colspan="2">Day Total</td><td class="r">${formatKES(dayNet)}</td><td class="r">${formatKES(dayVat)}</td><td class="r">${formatKES(dayTotal)}</td></tr></tfoot></table>`;
                          }).join('');
                          const grandTotal = salesData.sales.reduce((s, x) => s + x.totalCents, 0);
                          printHtml('Sales Report', `<h1>Sales Report</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)} &bull; ${salesData.sales.length} transactions</p>${rows}<div class="grand">Grand Total: ${formatKES(grandTotal)}</div>`);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        <Printer className="w-4 h-4" /> Print
                      </button>
                      <button
                        onClick={() => {
                          if (!salesData?.sales?.length) return;
                          downloadCsv(`sales-${startDate.substring(0,10)}-${endDate.substring(0,10)}.csv`, [
                            ['Receipt #', 'Date', 'Time', 'Net ex-VAT (KES)', 'VAT incl. (KES)', 'Total (KES)'],
                            ...salesData.sales.map((s) => [
                              s.receiptNumber ?? '',
                              new Date(s.createdAt).toLocaleDateString('en-KE'),
                              new Date(s.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
                              ((s.subtotalCents - s.vatCents) / 100).toFixed(2),
                              (s.vatCents / 100).toFixed(2),
                              (s.totalCents / 100).toFixed(2),
                            ]),
                          ]);
                        }}
                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Download className="w-4 h-4" /> Export CSV
                      </button>
                    </div>
                  </div>

                  {/* By Date view */}
                  {salesViewMode === 'by-date' && (() => {
                    const byDate: Record<string, NonNullable<typeof salesData>['sales']> = {};
                    for (const s of (salesData?.sales ?? [])) {
                      const d = new Date(s.createdAt).toLocaleDateString('en-KE', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
                      if (!byDate[d]) byDate[d] = [];
                      byDate[d].push(s);
                    }
                    const dateEntries = Object.entries(byDate);
                    return (
                      <div>
                        {dateEntries.length === 0 && (
                          <p className="px-5 py-8 text-center text-gray-400">No sales in this period</p>
                        )}
                        {dateEntries.map(([date, daySales]) => {
                          const dayTotal = daySales.reduce((s, x) => s + x.totalCents, 0);
                          const dayVat = daySales.reduce((s, x) => s + x.vatCents, 0);
                          const isExpanded = expandedSaleDate === date;
                          return (
                            <div key={date} className="border-b last:border-b-0">
                              {/* Date header row — clickable */}
                              <button
                                onClick={() => setExpandedSaleDate(isExpanded ? null : date)}
                                className="w-full flex items-center justify-between px-5 py-3 hover:bg-blue-50 transition-colors text-left"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${isExpanded ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                  <span className="font-semibold text-gray-800">{date}</span>
                                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{daySales.length} sales</span>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                  <span className="text-gray-500 hidden sm:block">VAT: <span className="font-medium text-purple-600">{formatKES(dayVat)}</span></span>
                                  <span className="font-bold text-gray-900">{formatKES(dayTotal)}</span>
                                  <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                                </div>
                              </button>
                              {/* Expanded transactions for this date */}
                              {isExpanded && (
                                <div className="bg-gray-50 border-t">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-gray-400">
                                        <th className="text-left px-8 py-2 font-medium">Receipt #</th>
                                        <th className="text-left px-3 py-2 font-medium">Time</th>
                                        <th className="text-right px-3 py-2 font-medium">Net (ex-VAT)</th>
                                        <th className="text-right px-3 py-2 font-medium">VAT (incl.)</th>
                                        <th className="text-right px-5 py-2 font-medium">Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {daySales.map((sale) => (
                                        <tr key={sale.id} className="hover:bg-white">
                                          <td className="px-8 py-2 font-mono text-xs text-blue-600">{sale.receiptNumber ?? '—'}</td>
                                          <td className="px-3 py-2 text-gray-500 text-xs">
                                            {new Date(sale.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                                          </td>
                                          <td className="px-3 py-2 text-right">{formatKES(sale.subtotalCents - sale.vatCents)}</td>
                                          <td className="px-3 py-2 text-right text-purple-600">{formatKES(sale.vatCents)}</td>
                                          <td className="px-5 py-2 text-right font-semibold">{formatKES(sale.totalCents)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot className="bg-blue-50">
                                      <tr className="font-semibold text-sm">
                                        <td colSpan={2} className="px-8 py-2 text-blue-700">Day Total ({daySales.length} sales)</td>
                                        <td className="px-3 py-2 text-right">{formatKES(daySales.reduce((s,x)=>s+x.subtotalCents - x.vatCents,0))}</td>
                                        <td className="px-3 py-2 text-right text-purple-600">{formatKES(dayVat)}</td>
                                        <td className="px-5 py-2 text-right text-blue-700">{formatKES(dayTotal)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* All transactions view */}
                  {salesViewMode === 'transactions' && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                            <th className="text-left px-5 py-3 font-medium text-gray-600">Date & Time</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600">Net (ex-VAT)</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600">VAT (incl.)</th>
                            <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {salesData?.sales?.map((sale) => (
                            <tr key={sale.id} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-mono text-xs text-blue-600">{sale.receiptNumber ?? '—'}</td>
                              <td className="px-5 py-3 text-gray-500">
                                {new Date(sale.createdAt).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-5 py-3 text-right">{formatKES(sale.subtotalCents - sale.vatCents)}</td>
                              <td className="px-5 py-3 text-right text-purple-600">{formatKES(sale.vatCents)}</td>
                              <td className="px-5 py-3 text-right font-semibold">{formatKES(sale.totalCents)}</td>
                            </tr>
                          ))}
                          {(!salesData?.sales || salesData.sales.length === 0) && (
                            <tr>
                              <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No sales in this period</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── ITEM SUMMARY ── */}
            {tab === 'item-summary' && (
              <div className="space-y-4">
                {!itemSummaryData && (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Loading…
                  </div>
                )}
                {itemSummaryData && (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <StatCard label="Departments" value={itemSummaryData.categories.length} icon={Package} color="bg-blue-500" />
                      <StatCard label="Total Items Sold" value={itemSummaryData.grandTotalQty} icon={ShoppingBag} color="bg-indigo-500" />
                      <StatCard label="Total Revenue" value={formatKES(itemSummaryData.grandTotalCents)} icon={DollarSign} color="bg-green-500" />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="font-semibold text-gray-800">Item Summary by Department</h2>
                          <p className="text-xs text-gray-500 mt-0.5">{startDate.substring(0,10)} to {endDate.substring(0,10)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              const deptRows = itemSummaryData.categories.map((cat) =>
                                `<h2>${cat.name} &mdash; ${cat.totalQty} items &mdash; ${formatKES(cat.totalCents)}</h2>
                                <table><thead><tr><th>Item Name</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
                                ${cat.items.map((i) => `<tr><td>${i.name}</td><td class="r">${i.qty}</td><td class="r">${formatKES(i.totalCents)}</td></tr>`).join('')}
                                </tbody><tfoot><tr><td>Subtotal</td><td class="r">${cat.totalQty}</td><td class="r">${formatKES(cat.totalCents)}</td></tr></tfoot></table>`
                              ).join('');
                              printHtml('Item Summary Report', `<h1>Item Summary Report</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)}</p>${deptRows}<div class="grand">Grand Total &mdash; ${itemSummaryData.grandTotalQty} items &mdash; ${formatKES(itemSummaryData.grandTotalCents)}</div>`);
                            }}
                            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                          >
                            <Printer className="w-4 h-4" /> Print
                          </button>
                          <button
                            onClick={() => {
                              const rows: string[][] = [['Department', 'Item Name', 'Qty Sold', 'Revenue (KES)']];
                              for (const cat of itemSummaryData.categories) {
                                for (const item of cat.items) {
                                  rows.push([cat.name, item.name, String(item.qty), (item.totalCents / 100).toFixed(2)]);
                                }
                                rows.push(['', `SUBTOTAL — ${cat.name}`, String(cat.totalQty), (cat.totalCents / 100).toFixed(2)]);
                                rows.push(['', '', '', '']);
                              }
                              rows.push(['GRAND TOTAL', '', String(itemSummaryData.grandTotalQty), (itemSummaryData.grandTotalCents / 100).toFixed(2)]);
                              downloadCsv(`item-summary-${startDate.substring(0,10)}-${endDate.substring(0,10)}.csv`, rows);
                            }}
                            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                          >
                            <Download className="w-4 h-4" /> Export CSV
                          </button>
                        </div>
                      </div>

                      {/* Table */}
                      <div>
                        {itemSummaryData.categories.length === 0 && (
                          <p className="px-5 py-10 text-center text-gray-400">No sales data for this period</p>
                        )}
                        {itemSummaryData.categories.map((cat, ci) => (
                          <div key={cat.name} className={ci > 0 ? 'border-t border-gray-100' : ''}>
                            {/* Department header */}
                            <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }}
                                />
                                <span className="font-semibold text-gray-800 uppercase text-sm tracking-wide">{cat.name}</span>
                                <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">{cat.totalQty} items</span>
                              </div>
                              <span className="font-bold text-gray-800">{formatKES(cat.totalCents)}</span>
                            </div>
                            {/* Item rows */}
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-gray-50">
                                {cat.items.map((item) => {
                                  const pct = cat.totalCents > 0 ? (item.totalCents / cat.totalCents) * 100 : 0;
                                  return (
                                    <tr key={item.name} className="hover:bg-gray-50">
                                      <td className="px-8 py-2.5 text-gray-800">{item.name}</td>
                                      <td className="px-5 py-2.5 text-right text-gray-500 w-20">{item.qty}</td>
                                      <td className="px-5 py-2.5 text-right font-medium w-36">{formatKES(item.totalCents)}</td>
                                      <td className="px-5 py-2.5 w-32">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                              className="h-full rounded-full"
                                              style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] }}
                                            />
                                          </div>
                                          <span className="text-xs text-gray-400 w-8 text-right">{pct.toFixed(0)}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              {/* Department subtotal */}
                              <tfoot>
                                <tr className="bg-gray-50 border-t border-gray-200">
                                  <td className="px-8 py-2 text-xs font-semibold text-gray-500 uppercase">Subtotal</td>
                                  <td className="px-5 py-2 text-right text-sm font-semibold text-gray-700">{cat.totalQty}</td>
                                  <td className="px-5 py-2 text-right text-sm font-bold text-gray-800">{formatKES(cat.totalCents)}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ))}

                        {/* Grand total row */}
                        {itemSummaryData.categories.length > 0 && (
                          <div className="flex items-center justify-between px-5 py-4 border-t-2 border-blue-200 bg-blue-50">
                            <span className="font-bold text-blue-800 text-base">GRAND TOTAL</span>
                            <div className="flex items-center gap-8">
                              <span className="font-bold text-blue-700">{itemSummaryData.grandTotalQty} items</span>
                              <span className="font-bold text-blue-900 text-base">{formatKES(itemSummaryData.grandTotalCents)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          openPdfReport(`/reports/pdf/vat?businessId=${encodeURIComponent(businessId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
                        }}
                        className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700"
                      >
                        <FileText className="w-4 h-4" />
                        PDF
                      </button>
                      <button
                        onClick={() => {
                          if (!vatData?.sales?.length) return;
                          const rows = vatData.sales.map((s) =>
                            `<tr><td>${s.receiptNumber ?? '—'}</td><td>${new Date(s.createdAt).toLocaleDateString('en-KE')}</td><td class="r">${formatKES(s.netCents)}</td><td class="r">${formatKES(s.vatCents)}</td><td class="r">${formatKES(s.totalCents)}</td></tr>`
                          ).join('');
                          printHtml('VAT Register', `<h1>VAT Register</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)}</p><table><thead><tr><th>Receipt #</th><th>Date</th><th class="r">Net ex-VAT</th><th class="r">VAT 16%</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">TOTAL</td><td class="r">${formatKES(vatData.totalNetCents ?? vatData.totalSalesCents - vatData.totalVatCents)}</td><td class="r">${formatKES(vatData.totalVatCents)}</td><td class="r">${formatKES(vatData.totalSalesCents)}</td></tr></tfoot></table>`);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        <Printer className="w-4 h-4" /> Print
                      </button>
                      <button
                        onClick={() => {
                          if (!vatData?.sales?.length) return;
                          downloadCsv(`vat-register-${startDate}-${endDate}.csv`, [
                            ['Receipt #', 'Date', 'Net ex-VAT (KES)', 'VAT 16% incl. (KES)', 'Total (KES)'],
                            ...vatData.sales.map((s) => [
                              s.receiptNumber ?? '',
                              new Date(s.createdAt).toLocaleDateString('en-KE'),
                              (s.netCents / 100).toFixed(2),
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
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Net (ex-VAT)</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">VAT 16% (incl.)</th>
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
                            <td className="px-5 py-3 text-right">{formatKES(sale.netCents)}</td>
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
                            {formatKES(vatData.totalNetCents ?? (vatData.totalSalesCents - vatData.totalVatCents))}
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
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (!plData) return;
                            const margin = plData.revenueCents > 0 ? ((plData.netProfitCents / plData.revenueCents) * 100).toFixed(1) : '0.0';
                            printHtml('Profit & Loss Statement', `<h1>Profit &amp; Loss Statement</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)}</p><table><tbody><tr><td>Revenue</td><td class="r" style="color:#16a34a">${formatKES(plData.revenueCents)}</td></tr><tr><td style="padding-left:20px">Cost of Goods Sold</td><td class="r" style="color:#dc2626">(${formatKES(plData.cogsCents)})</td></tr><tr style="font-weight:bold;border-top:2px solid #ccc"><td>Gross Profit</td><td class="r" style="color:${plData.grossProfitCents>=0?'#16a34a':'#dc2626'}">${formatKES(plData.grossProfitCents)}</td></tr><tr><td style="padding-left:20px">Operating Expenses</td><td class="r" style="color:#dc2626">(${formatKES(plData.expensesCents)})</td></tr><tr style="font-weight:bold;border-top:2px solid #2563eb"><td>Net Profit</td><td class="r" style="color:${plData.netProfitCents>=0?'#16a34a':'#dc2626'}">${formatKES(plData.netProfitCents)}</td></tr></tbody></table><p style="text-align:right;color:#888;font-size:9pt;margin-top:8px">Net Margin: ${margin}%</p>`);
                          }}
                          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                        >
                          <Printer className="w-4 h-4" /> Print
                        </button>
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
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              if (!stockData?.items?.length) return;
                              const rows = stockData.items.map((i) =>
                                `<tr><td>${i.name}</td><td class="r">${i.quantity.toLocaleString()}</td><td class="r">${formatKES(i.costPriceCents)}</td><td class="r">${formatKES(i.valueCents)}</td></tr>`
                              ).join('');
                              printHtml('Stock Valuation Report', `<h1>Stock Valuation</h1><p class="sub">As of ${new Date().toLocaleDateString('en-KE')} &bull; ${stockData.items.length} products</p><table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Cost/Unit</th><th class="r">Total Value</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">TOTAL</td><td class="r">${formatKES(stockData.totalValueCents)}</td></tr></tfoot></table>`);
                            }}
                            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                          >
                            <Printer className="w-4 h-4" /> Print
                          </button>
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (!attendanceReport.length) return;
                          const rows = attendanceReport.map((r) =>
                            `<tr><td>${r.employee?.user.name ?? r.id.slice(0,8)}</td><td>${r.employee?.user.role ?? ''}</td><td>${new Date(r.shiftDate).toLocaleDateString('en-KE')}</td><td class="r">${new Date(r.clockIn).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</td><td class="r">${r.clockOut?new Date(r.clockOut).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'}):'-'}</td><td class="r" style="color:${r.isLate?'#dc2626':'#16a34a'}">${r.isLate?'Late':'On Time'}</td></tr>`
                          ).join('');
                          const lateCount = attendanceReport.filter((r)=>r.isLate).length;
                          printHtml('Attendance Report', `<h1>Attendance Report</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)} &bull; ${attendanceReport.length} records &bull; ${lateCount} late</p><table><thead><tr><th>Employee</th><th>Role</th><th>Date</th><th class="r">Clock In</th><th class="r">Clock Out</th><th class="r">Status</th></tr></thead><tbody>${rows}</tbody></table>`);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        <Printer className="w-4 h-4" /> Print
                      </button>
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
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          if (!commissionReport.length) return;
                          const rows = [...commissionReport].sort((a,b)=>b.commissionCents-a.commissionCents).map((c) =>
                            `<tr><td>${c.employeeName}</td><td class="r">${c.commissionRate}${c.commissionBasis==='TRANSACTION_COUNT'?' KES/txn':'%'}</td><td class="r">${c.salesCount}</td><td class="r">${formatKES(c.totalSalesCents)}</td><td class="r" style="color:#16a34a;font-weight:bold">${formatKES(c.commissionCents)}</td></tr>`
                          ).join('');
                          const totalComm = commissionReport.reduce((s,c)=>s+c.commissionCents,0);
                          printHtml('Commission Report', `<h1>Commission Report</h1><p class="sub">${startDate.substring(0,10)} to ${endDate.substring(0,10)}</p><table><thead><tr><th>Employee</th><th class="r">Rate</th><th class="r">Sales</th><th class="r">Total Sales</th><th class="r">Commission</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="4">TOTAL</td><td class="r" style="color:#16a34a">${formatKES(totalComm)}</td></tr></tfoot></table>`);
                        }}
                        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                      >
                        <Printer className="w-4 h-4" /> Print
                      </button>
                      <button
                        onClick={() => {
                          if (!commissionReport.length) return;
                          downloadCsv(`commissions-${startDate}-${endDate}.csv`, [
                            ['Employee', 'Commission Rate', 'Basis', 'Sales Count', 'Total Sales (KES)', 'Commission Earned (KES)'],
                            ...commissionReport.map((c) => [
                              c.employeeName,
                              `${c.commissionRate}${c.commissionBasis === 'TRANSACTION_COUNT' ? ' KES/txn' : '%'}`,
                              c.commissionBasis ?? 'SALES_VALUE',
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
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-5 py-3 font-medium text-gray-600">Employee</th>
                        <th className="text-center px-5 py-3 font-medium text-gray-600">Rate</th>
                        <th className="text-center px-5 py-3 font-medium text-gray-600">Basis</th>
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
                              <td className="px-5 py-3 text-center">{c.commissionRate}{c.commissionBasis === 'TRANSACTION_COUNT' ? ' KES/txn' : '%'}</td>
                              <td className="px-5 py-3 text-center">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  c.commissionBasis === 'TRANSACTION_COUNT' ? 'bg-purple-100 text-purple-700' :
                                  c.commissionBasis === 'GROSS_MARGIN'      ? 'bg-blue-100 text-blue-700' :
                                                                              'bg-gray-100 text-gray-600'
                                }`}>
                                  {c.commissionBasis === 'TRANSACTION_COUNT' ? 'Per Txn' :
                                   c.commissionBasis === 'GROSS_MARGIN'      ? 'Margin' : 'Sales'}
                                </span>
                              </td>
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
                          <td colSpan={5} className="px-5 py-3">TOTAL</td>
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

            {/* ── RECIPE VARIANCE ── */}
            {tab === 'recipes' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatCard label="Ingredients Tracked" value={recipeVariance.length} icon={ChefHat} color="bg-orange-500" />
                  <StatCard
                    label="Over Variance (>10%)"
                    value={recipeVariance.filter((r) => Math.abs(r.variancePct ?? 0) > 10).length}
                    icon={AlertCircle}
                    color="bg-red-500"
                  />
                  <StatCard
                    label="Within Target"
                    value={recipeVariance.filter((r) => Math.abs(r.variancePct ?? 0) <= 10).length}
                    icon={TrendingUp}
                    color="bg-green-500"
                  />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Recipe vs Actual Usage</h2>
                    <button
                      onClick={() => {
                        if (!recipeVariance.length) return;
                        downloadCsv(`recipe-variance-${startDate}-${endDate}.csv`, [
                          ['Ingredient', 'Planned (g)', 'Actual (g)', 'Variance (g)', 'Variance %'],
                          ...recipeVariance.map((r) => [
                            r.ingredientName,
                            r.plannedGrams.toFixed(1),
                            r.actualGrams != null ? r.actualGrams.toFixed(1) : 'N/A',
                            r.varianceGrams != null ? r.varianceGrams.toFixed(1) : 'N/A',
                            r.variancePct != null ? (r.variancePct > 0 ? '+' : '') + r.variancePct.toFixed(1) + '%' : 'N/A',
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
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Ingredient</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Planned (g)</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Actual (g)</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Variance (g)</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Variance %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {recipeVariance.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No recipe data for this period</td>
                          </tr>
                        ) : (
                          recipeVariance.map((r, i) => {
                            const vPct = r.variancePct ?? 0;
                            const vGrams = r.varianceGrams ?? 0;
                            const isHigh = Math.abs(vPct) > 10;
                            return (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium">{r.ingredientName}</td>
                                <td className="px-5 py-3 text-right text-gray-500">{r.plannedGrams.toFixed(1)}</td>
                                <td className="px-5 py-3 text-right">{r.actualGrams != null ? r.actualGrams.toFixed(1) : '—'}</td>
                                <td className={`px-5 py-3 text-right ${vGrams > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                  {r.varianceGrams != null ? `${vGrams > 0 ? '+' : ''}${vGrams.toFixed(1)}` : '—'}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isHigh ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {r.variancePct != null ? `${vPct > 0 ? '+' : ''}${vPct.toFixed(1)}%` : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── BUNDLE PROFITABILITY ── */}
            {tab === 'bundles' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Bundles Sold" value={bundleProfitability.reduce((s, b) => s + b.sold, 0)} icon={Layers} color="bg-blue-500" />
                  <StatCard label="Total Revenue" value={formatKES(bundleProfitability.reduce((s, b) => s + b.revenueCents, 0))} icon={DollarSign} color="bg-green-500" />
                  <StatCard label="Total Cost" value={formatKES(bundleProfitability.reduce((s, b) => s + b.totalCostCents, 0))} icon={Package} color="bg-orange-500" />
                  <StatCard label="Total Profit" value={formatKES(bundleProfitability.reduce((s, b) => s + b.profitCents, 0))} icon={TrendingUp} color="bg-purple-500" />
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <h2 className="font-semibold text-gray-800">Bundle Profitability</h2>
                    <button
                      onClick={() => {
                        if (!bundleProfitability.length) return;
                        downloadCsv(`bundle-profitability-${startDate}-${endDate}.csv`, [
                          ['Bundle', 'Sold', 'Revenue (KES)', 'Cost (KES)', 'Profit (KES)', 'Margin %'],
                          ...bundleProfitability.map((b) => [
                            b.bundleName,
                            String(b.sold),
                            (b.revenueCents / 100).toFixed(2),
                            (b.totalCostCents / 100).toFixed(2),
                            (b.profitCents / 100).toFixed(2),
                            b.marginPct.toFixed(1) + '%',
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
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Bundle</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Sold</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Revenue</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Cost</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Profit</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {bundleProfitability.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-gray-400">No bundle sales in this period</td>
                          </tr>
                        ) : (
                          bundleProfitability
                            .sort((a, b) => b.profitCents - a.profitCents)
                            .map((b) => (
                              <tr key={b.bundleId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium">{b.bundleName}</td>
                                <td className="px-5 py-3 text-center">{b.sold}</td>
                                <td className="px-5 py-3 text-right">{formatKES(b.revenueCents)}</td>
                                <td className="px-5 py-3 text-right text-gray-500">{formatKES(b.totalCostCents)}</td>
                                <td className={`px-5 py-3 text-right font-semibold ${b.profitCents >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                  {formatKES(b.profitCents)}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${b.marginPct >= 20 ? 'bg-green-100 text-green-700' : b.marginPct >= 10 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {b.marginPct.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                      {bundleProfitability.length > 0 && (
                        <tfoot className="bg-gray-50 font-bold">
                          <tr>
                            <td className="px-5 py-3">TOTAL</td>
                            <td className="px-5 py-3 text-center">{bundleProfitability.reduce((s, b) => s + b.sold, 0)}</td>
                            <td className="px-5 py-3 text-right">{formatKES(bundleProfitability.reduce((s, b) => s + b.revenueCents, 0))}</td>
                            <td className="px-5 py-3 text-right">{formatKES(bundleProfitability.reduce((s, b) => s + b.totalCostCents, 0))}</td>
                            <td className="px-5 py-3 text-right text-green-700">{formatKES(bundleProfitability.reduce((s, b) => s + b.profitCents, 0))}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ── SUPPLIERS ── */}
            {tab === 'suppliers' && (
              <div className="space-y-6">
                {/* Supplier Ledger */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <div>
                      <h2 className="font-semibold text-gray-800">Supplier Ledger</h2>
                      <p className="text-xs text-gray-500 mt-0.5">Purchase orders by supplier</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!supplierLedger.length) return;
                        downloadCsv(`supplier-ledger-${startDate}-${endDate}.csv`, [
                          ['Supplier', 'Total POs', 'Pending', 'Received', 'Total Value (KES)'],
                          ...supplierLedger.map((s) => [
                            s.supplierName,
                            String(s.poCount),
                            String(s.pendingCount),
                            String(s.receivedCount),
                            (s.totalValueCents / 100).toFixed(2),
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
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Supplier</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Total POs</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Pending</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Received</th>
                          <th className="text-right px-5 py-3 font-medium text-gray-600">Total Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {supplierLedger.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No supplier data for this period</td>
                          </tr>
                        ) : (
                          supplierLedger.map((s) => (
                            <tr key={s.supplierId} className="hover:bg-gray-50">
                              <td className="px-5 py-3 font-medium">{s.supplierName}</td>
                              <td className="px-5 py-3 text-center">{s.poCount}</td>
                              <td className="px-5 py-3 text-center">
                                {s.pendingCount > 0 ? (
                                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{s.pendingCount}</span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{s.receivedCount}</span>
                              </td>
                              <td className="px-5 py-3 text-right font-semibold">{formatKES(s.totalValueCents)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {supplierLedger.length > 0 && (
                        <tfoot className="bg-gray-50 font-bold">
                          <tr>
                            <td colSpan={4} className="px-5 py-3">TOTAL</td>
                            <td className="px-5 py-3 text-right">{formatKES(supplierLedger.reduce((s, r) => s + r.totalValueCents, 0))}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Supplier Performance */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b flex justify-between items-center">
                    <div>
                      <h2 className="font-semibold text-gray-800">Supplier Performance</h2>
                      <p className="text-xs text-gray-500 mt-0.5">On-time delivery, lead time, fill rate</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!supplierPerformance.length) return;
                        downloadCsv(`supplier-performance-${startDate}-${endDate}.csv`, [
                          ['Supplier', 'On-Time Rate', 'Avg Lead Time (days)', 'Fill Rate'],
                          ...supplierPerformance.map((s) => [
                            s.supplierName,
                            s.onTimeRate.toFixed(1) + '%',
                            s.avgLeadTimeDays.toFixed(1),
                            s.fillRate.toFixed(1) + '%',
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
                          <th className="text-left px-5 py-3 font-medium text-gray-600">Supplier</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">On-Time Rate</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Avg Lead Time</th>
                          <th className="text-center px-5 py-3 font-medium text-gray-600">Fill Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {supplierPerformance.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-gray-400">No performance data for this period</td>
                          </tr>
                        ) : (
                          supplierPerformance
                            .sort((a, b) => b.onTimeRate - a.onTimeRate)
                            .map((s) => (
                              <tr key={s.supplierId} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-medium">{s.supplierName}</td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.onTimeRate >= 80 ? 'bg-green-100 text-green-700' : s.onTimeRate >= 60 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {s.onTimeRate.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-center">{s.avgLeadTimeDays.toFixed(1)} days</td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${s.fillRate >= 90 ? 'bg-green-100 text-green-700' : s.fillRate >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                    {s.fillRate.toFixed(1)}%
                                  </span>
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

            {/* ── SUPPLIER AGEING ── */}
            {tab === 'supplier-ageing' && (
              <div className="space-y-4">
                {supplierAgeing ? (
                  <>
                    {/* Summary buckets */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      {[
                        { label: 'Total Outstanding', value: supplierAgeing.summary.totalOutstandingCents, color: 'bg-gray-700' },
                        { label: 'Current', value: supplierAgeing.summary.currentCents, color: 'bg-green-500' },
                        { label: '1–30 Days', value: supplierAgeing.summary.days1to30Cents, color: 'bg-yellow-500' },
                        { label: '31–60 Days', value: supplierAgeing.summary.days31to60Cents, color: 'bg-orange-500' },
                        { label: '61–90 Days', value: supplierAgeing.summary.days61to90Cents, color: 'bg-red-500' },
                        { label: '90+ Days', value: supplierAgeing.summary.days90plusCents, color: 'bg-red-800' },
                      ].map((b) => (
                        <div key={b.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                          <div className={`w-2 h-2 rounded-full ${b.color} mb-2`} />
                          <p className="text-lg font-bold text-gray-900">{formatKES(b.value)}</p>
                          <p className="text-xs text-gray-500">{b.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <div>
                          <h2 className="font-semibold text-gray-800">Supplier Ageing Statement</h2>
                          <p className="text-xs text-gray-500 mt-0.5">As of {new Date(supplierAgeing.asOfDate).toLocaleDateString('en-KE')} · {supplierAgeing.summary.totalSuppliers} suppliers with open orders</p>
                        </div>
                        <button
                          onClick={() => {
                            if (!supplierAgeing.rows.length) return;
                            downloadCsv(`supplier-ageing-${new Date().toISOString().split('T')[0]}.csv`, [
                              ['Supplier', 'Contact', 'Payment Terms', 'Total Outstanding (KES)', 'Current (KES)', '1-30 Days (KES)', '31-60 Days (KES)', '61-90 Days (KES)', '90+ Days (KES)', 'Overdue Orders', 'Total Orders'],
                              ...supplierAgeing.rows.map((r) => [
                                r.supplierName,
                                r.contact ?? '',
                                r.paymentTerms ?? '',
                                (r.totalOutstandingCents / 100).toFixed(2),
                                (r.currentCents / 100).toFixed(2),
                                (r.days1to30Cents / 100).toFixed(2),
                                (r.days31to60Cents / 100).toFixed(2),
                                (r.days61to90Cents / 100).toFixed(2),
                                (r.days90plusCents / 100).toFixed(2),
                                String(r.overdueOrderCount),
                                String(r.totalOrderCount),
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium"
                        >
                          <Download className="w-4 h-4" /> CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium">Supplier</th>
                              <th className="text-right px-3 py-3 font-medium">Total</th>
                              <th className="text-right px-3 py-3 font-medium text-green-700">Current</th>
                              <th className="text-right px-3 py-3 font-medium text-yellow-700">1–30d</th>
                              <th className="text-right px-3 py-3 font-medium text-orange-700">31–60d</th>
                              <th className="text-right px-3 py-3 font-medium text-red-600">61–90d</th>
                              <th className="text-right px-3 py-3 font-medium text-red-800">90+d</th>
                              <th className="text-center px-3 py-3 font-medium">Overdue</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {supplierAgeing.rows.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="px-5 py-8 text-center text-gray-400">No outstanding supplier orders</td>
                              </tr>
                            ) : (
                              supplierAgeing.rows.map((r) => (
                                <tr key={r.supplierId} className="hover:bg-gray-50">
                                  <td className="px-5 py-3">
                                    <div className="font-medium text-gray-800">{r.supplierName}</div>
                                    {r.paymentTerms && <div className="text-xs text-gray-400">{r.paymentTerms}</div>}
                                  </td>
                                  <td className="px-3 py-3 text-right font-semibold">{formatKES(r.totalOutstandingCents)}</td>
                                  <td className="px-3 py-3 text-right text-green-700">{r.currentCents > 0 ? formatKES(r.currentCents) : '—'}</td>
                                  <td className="px-3 py-3 text-right text-yellow-700">{r.days1to30Cents > 0 ? formatKES(r.days1to30Cents) : '—'}</td>
                                  <td className="px-3 py-3 text-right text-orange-700">{r.days31to60Cents > 0 ? formatKES(r.days31to60Cents) : '—'}</td>
                                  <td className="px-3 py-3 text-right text-red-600">{r.days61to90Cents > 0 ? formatKES(r.days61to90Cents) : '—'}</td>
                                  <td className="px-3 py-3 text-right text-red-800 font-semibold">{r.days90plusCents > 0 ? formatKES(r.days90plusCents) : '—'}</td>
                                  <td className="px-3 py-3 text-center">
                                    {r.overdueOrderCount > 0 ? (
                                      <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                                        {r.overdueOrderCount}/{r.totalOrderCount}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-xs">0/{r.totalOrderCount}</span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          {supplierAgeing.rows.length > 0 && (
                            <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                              <tr>
                                <td className="px-5 py-3 text-gray-700">Total ({supplierAgeing.summary.totalSuppliers} suppliers)</td>
                                <td className="px-3 py-3 text-right">{formatKES(supplierAgeing.summary.totalOutstandingCents)}</td>
                                <td className="px-3 py-3 text-right text-green-700">{formatKES(supplierAgeing.summary.currentCents)}</td>
                                <td className="px-3 py-3 text-right text-yellow-700">{formatKES(supplierAgeing.summary.days1to30Cents)}</td>
                                <td className="px-3 py-3 text-right text-orange-700">{formatKES(supplierAgeing.summary.days31to60Cents)}</td>
                                <td className="px-3 py-3 text-right text-red-600">{formatKES(supplierAgeing.summary.days61to90Cents)}</td>
                                <td className="px-3 py-3 text-right text-red-800">{formatKES(supplierAgeing.summary.days90plusCents)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* ── CREDIT BOOK ── */}
            {tab === 'credit' && (
              <div className="space-y-4">
                {creditBook ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <StatCard
                        label="Total Outstanding"
                        value={formatKES(creditBook.summary.totalOutstandingCents)}
                        icon={DollarSign}
                        color="bg-red-500"
                        sub={`${creditBook.summary.totalCreditSales} credit sales`}
                      />
                      <StatCard
                        label="Unique Debtors"
                        value={creditBook.summary.uniqueDebtors}
                        icon={ShoppingBag}
                        color="bg-orange-500"
                      />
                      <StatCard
                        label="Avg Outstanding"
                        value={creditBook.summary.uniqueDebtors > 0
                          ? formatKES(Math.round(creditBook.summary.totalOutstandingCents / creditBook.summary.uniqueDebtors))
                          : 'KES 0.00'}
                        icon={TrendingUp}
                        color="bg-amber-500"
                      />
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <div>
                          <h2 className="font-semibold text-gray-800">Credit Book</h2>
                          <p className="text-xs text-gray-500 mt-0.5">Outstanding balances from credit sales</p>
                        </div>
                        <button
                          onClick={() => {
                            if (!creditBook.rows.length) return;
                            downloadCsv(`credit-book-${startDate}-${endDate}.csv`, [
                              ['Receipt', 'Date', 'Customer', 'Phone', 'Total (KES)', 'Paid (KES)', 'Outstanding (KES)', 'Days', 'Aging'],
                              ...creditBook.rows.map((r) => [
                                r.receiptNumber ?? '',
                                new Date(r.date).toLocaleDateString('en-KE'),
                                r.customerName,
                                r.customerPhone ?? '',
                                (r.totalCents / 100).toFixed(2),
                                (r.paidCents / 100).toFixed(2),
                                (r.outstandingCents / 100).toFixed(2),
                                String(r.daysSince),
                                r.agingBucket,
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
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Date</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Customer</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Paid</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Outstanding</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Aging</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {creditBook.rows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="px-5 py-8 text-center text-gray-400">No credit sales in this period</td>
                              </tr>
                            ) : (
                              creditBook.rows.map((r) => {
                                const agingColor = r.daysSince <= 30
                                  ? 'bg-green-100 text-green-700'
                                  : r.daysSince <= 60
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : r.daysSince <= 90
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-red-100 text-red-700';
                                return (
                                  <tr key={r.saleId} className="hover:bg-gray-50">
                                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{r.receiptNumber ?? '—'}</td>
                                    <td className="px-5 py-3 text-gray-500">
                                      {new Date(r.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </td>
                                    <td className="px-5 py-3">
                                      <div className="font-medium">{r.customerName}</div>
                                      {r.customerPhone && <div className="text-xs text-gray-400">{r.customerPhone}</div>}
                                    </td>
                                    <td className="px-5 py-3 text-right">{formatKES(r.totalCents)}</td>
                                    <td className="px-5 py-3 text-right text-green-600">{formatKES(r.paidCents)}</td>
                                    <td className="px-5 py-3 text-right font-semibold text-red-600">{formatKES(r.outstandingCents)}</td>
                                    <td className="px-5 py-3 text-center">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${agingColor}`}>
                                        {r.agingBucket}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          {creditBook.rows.length > 0 && (
                            <tfoot className="bg-gray-50 font-bold">
                              <tr>
                                <td colSpan={5} className="px-5 py-3">TOTAL OUTSTANDING</td>
                                <td className="px-5 py-3 text-right text-red-600">{formatKES(creditBook.summary.totalOutstandingCents)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                    Loading credit book…
                  </div>
                )}
              </div>
            )}

            {/* ── STOCK HISTORY ── */}
            {tab === 'stock-history' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">As-of Date</label>
                      <input
                        type="date"
                        value={historyAsOf}
                        max={new Date().toISOString().substring(0, 10)}
                        onChange={(e) => setHistoryAsOf(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-4">
                      Shows stock levels at the end of the selected date (based on inventory movements).
                    </p>
                  </div>
                </div>

                {historicalStock && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <StatCard label="Stock Lines" value={historicalStock.totalItems} icon={Package} color="bg-blue-500" />
                      <StatCard label="Total Value" value={formatKES(historicalStock.totalValueCents)} icon={DollarSign} color="bg-green-500" />
                      <StatCard label="As-of Date" value={new Date(historyAsOf).toLocaleDateString('en-KE')} icon={History} color="bg-purple-500" />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Historical Stock Levels</h2>
                        <button
                          onClick={() => {
                            if (!historicalStock.items.length) return;
                            downloadCsv(`stock-history-${historyAsOf}.csv`, [
                              ['Item', 'Category', 'Barcode', 'Qty', 'Cost (KES)', 'Value (KES)'],
                              ...historicalStock.items.map((i) => [
                                i.name, i.category, i.barcode, String(i.quantity),
                                (i.costPriceCents / 100).toFixed(2), (i.valueCents / 100).toFixed(2),
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Item</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Category</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Qty</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Cost/Unit</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Value</th>
                              <th className="px-5 py-3"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {historicalStock.items.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                                  <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                  No stock data for this date. Add items with initial stock quantity or receive goods via a Purchase Order.
                                </td>
                              </tr>
                            )}
                            {historicalStock.items.map((item) => (
                              <tr key={item.itemId} className={`hover:bg-gray-50 ${item.quantity === 0 ? 'opacity-50' : ''}`}>
                                <td className="px-5 py-3 font-medium">{item.name}</td>
                                <td className="px-5 py-3 text-gray-500">{item.category || '—'}</td>
                                <td className={`px-5 py-3 text-right font-semibold ${item.quantity === 0 ? 'text-gray-400' : ''}`}>{item.quantity}</td>
                                <td className="px-5 py-3 text-right text-gray-500">{formatKES(item.costPriceCents)}</td>
                                <td className="px-5 py-3 text-right font-semibold text-green-700">{item.quantity > 0 ? formatKES(item.valueCents) : '—'}</td>
                                <td className="px-5 py-3 text-right">
                                  <button
                                    onClick={() => {
                                      setWriteOffItem({ itemId: item.itemId, name: item.name, qty: item.quantity });
                                      setWriteOffQty('');
                                      setWriteOffReason('WRITE_OFF');
                                      setWriteOffNotes('');
                                    }}
                                    className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 border border-orange-200 rounded px-2 py-1"
                                    title="Write-off / Adjust stock"
                                  >
                                    <Pencil className="w-3 h-3" /> Adjust
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50 font-bold">
                            <tr>
                              <td colSpan={4} className="px-5 py-3">TOTAL VALUE</td>
                              <td className="px-5 py-3 text-right text-green-700">{formatKES(historicalStock.totalValueCents)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </>
                )}

                {/* Write-off / Adjustment modal */}
                {writeOffItem && (
                  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
                      <div className="flex items-center justify-between px-6 py-4 border-b">
                        <h3 className="font-bold text-gray-900">Stock Adjustment — {writeOffItem.name}</h3>
                        <button onClick={() => setWriteOffItem(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="px-6 py-5 space-y-4">
                        <p className="text-sm text-gray-600">Current stock on selected date: <strong>{writeOffItem.qty}</strong> units</p>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                          <select
                            value={writeOffReason}
                            onChange={(e) => setWriteOffReason(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                          >
                            <option value="WRITE_OFF">Write-Off (General)</option>
                            <option value="DAMAGED">Damaged</option>
                            <option value="EXPIRED">Expired / Spoilage</option>
                            <option value="THEFT">Theft / Shrinkage</option>
                            <option value="ADJUSTMENT">Manual Correction</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to remove</label>
                          <input
                            type="number"
                            min="1"
                            max={writeOffItem.qty}
                            value={writeOffQty}
                            onChange={(e) => setWriteOffQty(e.target.value)}
                            placeholder="e.g. 5"
                            className="w-full border rounded-lg px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                          <textarea
                            value={writeOffNotes}
                            onChange={(e) => setWriteOffNotes(e.target.value)}
                            rows={2}
                            placeholder="e.g. Found 5 units mouldy during stock count"
                            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                          />
                        </div>
                        {writeOffMutation.isError && (
                          <p className="text-sm text-red-600">Failed to save adjustment. Please try again.</p>
                        )}
                        {writeOffMutation.isSuccess && (
                          <p className="text-sm text-green-600">Adjustment recorded successfully.</p>
                        )}
                      </div>
                      <div className="px-6 py-4 border-t flex gap-3 justify-end">
                        <button onClick={() => setWriteOffItem(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                        <button
                          disabled={!writeOffQty || Number(writeOffQty) <= 0 || writeOffMutation.isPending}
                          onClick={() => {
                            if (!writeOffItem || !writeOffQty) return;
                            writeOffMutation.mutate({
                              itemId: writeOffItem.itemId,
                              qty: Number(writeOffQty),
                              reason: writeOffReason,
                              notes: writeOffNotes,
                            });
                          }}
                          className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                        >
                          {writeOffMutation.isPending ? 'Saving…' : 'Save Adjustment'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EMPLOYEE SALES REPORT ── */}
            {tab === 'employee-sales' && (
              <div className="space-y-4">
                {/* Employee filter */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap items-center gap-3">
                  <Users className="w-4 h-4 text-gray-400" />
                  <label className="text-sm font-medium text-gray-700">Filter by employee:</label>
                  <select
                    value={empSalesFilter}
                    onChange={(e) => setEmpSalesFilter(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 min-w-[200px]"
                  >
                    <option value="">All Employees</option>
                    {businessUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                  {empSalesFilter && (
                    <button
                      onClick={() => setEmpSalesFilter('')}
                      className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                {/* Summary cards */}
                {employeeSalesData && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Employees" value={employeeSalesData.summary.totalEmployees} icon={Users} color="bg-blue-500" />
                    <StatCard label="Total Transactions" value={employeeSalesData.summary.totalSales} icon={ShoppingBag} color="bg-indigo-500" />
                    <StatCard label="Total Revenue" value={formatKES(employeeSalesData.summary.totalRevenueCents)} icon={TrendingUp} color="bg-green-500" />
                    <StatCard label="M-Pesa Collected" value={formatKES(employeeSalesData.summary.totalMpesaCents)} icon={Smartphone} color="bg-emerald-500" />
                  </div>
                )}

                {/* CSV export + Print All */}
                {employeeSalesData && (
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        // Print all employees
                        const dateLabel = `${startDate.substring(0,10)} to ${endDate.substring(0,10)}`;
                        const body = employeeSalesData.rows.map((emp) => {
                          const catRows = emp.categories.map((cat) =>
                            `<h2>${cat.name} &mdash; ${formatKES(cat.subtotalCents)}</h2>
                            <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead><tbody>
                            ${cat.items.map((i) => `<tr><td>${i.itemName}</td><td class="r">${i.qty}</td><td class="r">${formatKES(i.totalCents)}</td></tr>`).join('')}
                            </tbody></table>`
                          ).join('');
                          const mpesaRows = emp.mpesaPayments.length
                            ? `<h2 style="border-left-color:#059669">M-Pesa Transactions (${emp.mpesaPayments.length}) &mdash; ${formatKES(emp.mpesaTotalCents)}</h2>
                               <table><thead><tr><th>Reference</th><th>Receipt</th><th>Time</th><th class="r">Amount</th></tr></thead><tbody>
                               ${emp.mpesaPayments.map((p) => `<tr><td>${p.mpesaRef ?? 'M-PESA'}</td><td>${p.saleReceiptNumber ?? '—'}</td><td>${new Date(p.createdAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</td><td class="r">${formatKES(p.amountCents)}</td></tr>`).join('')}
                               </tbody></table>` : '';
                          return `<div style="page-break-inside:avoid;margin-bottom:20px;border:1px solid #ddd;padding:12px;border-radius:6px">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                              <div><strong style="font-size:14pt">${emp.employeeName}</strong> <span style="color:#666;font-size:9pt">${emp.role}</span></div>
                              <div style="text-align:right;font-size:9pt">Sales: <strong>${emp.salesCount}</strong> &bull; Revenue: <strong>${formatKES(emp.totalCents)}</strong> &bull; M-Pesa: <strong>${formatKES(emp.mpesaTotalCents)}</strong></div>
                            </div>
                            ${catRows}${mpesaRows}
                            <div style="margin-top:8px;padding:6px;background:#f0f9ff;border-left:4px solid #2563eb">
                              Cash Expected = Total Revenue (${formatKES(emp.totalCents)}) &minus; M-Pesa (${formatKES(emp.mpesaTotalCents)}) = <strong>${formatKES(emp.totalCents - emp.mpesaTotalCents)}</strong>
                            </div>
                          </div>`;
                        }).join('');
                        printHtml('Employee Sales Report', `<h1>Employee Sales Report</h1><p class="sub">${dateLabel}</p>${body}`);
                      }}
                      className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800"
                    >
                      <Printer className="w-4 h-4" /> Print All
                    </button>
                    <button
                      onClick={() => {
                        const rows: string[][] = [['Employee', 'Role', 'Transactions', 'Revenue (KES)', 'Category', 'Item', 'Qty', 'Item Revenue (KES)', 'M-Pesa Total (KES)']];
                        for (const emp of employeeSalesData.rows) {
                          for (const cat of emp.categories) {
                            for (const item of cat.items) {
                              rows.push([emp.employeeName, emp.role, String(emp.salesCount), (emp.totalCents / 100).toFixed(2), cat.name, item.itemName, String(item.qty), (item.totalCents / 100).toFixed(2), (emp.mpesaTotalCents / 100).toFixed(2)]);
                            }
                          }
                          if (emp.categories.length === 0) {
                            rows.push([emp.employeeName, emp.role, String(emp.salesCount), (emp.totalCents / 100).toFixed(2), '', '', '', '', (emp.mpesaTotalCents / 100).toFixed(2)]);
                          }
                        }
                        downloadCsv(`employee-sales-${startDate.substring(0, 10)}-to-${endDate.substring(0, 10)}.csv`, rows);
                      }}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Download className="w-4 h-4" /> Export CSV
                    </button>
                  </div>
                )}

                {/* Per-employee sections */}
                {(employeeSalesData?.rows ?? []).map((emp) => (
                  <div key={emp.employeeId} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Employee header */}
                    <div className="bg-blue-50 px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-blue-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-600 text-white w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm">
                          {emp.employeeName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{emp.employeeName}</p>
                          <p className="text-xs text-gray-500 uppercase">{emp.role}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-bold text-gray-900">{emp.salesCount}</p>
                            <p className="text-gray-500 text-xs">Sales</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-green-700">{formatKES(emp.totalCents)}</p>
                            <p className="text-gray-500 text-xs">Revenue</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-emerald-700">{formatKES(emp.mpesaTotalCents)}</p>
                            <p className="text-gray-500 text-xs">M-Pesa</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const dateLabel = `${startDate.substring(0,10)} to ${endDate.substring(0,10)}`;
                            const catRows = emp.categories.map((cat) =>
                              `<h2>${cat.name} &mdash; ${formatKES(cat.subtotalCents)}</h2>
                              <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Revenue</th></tr></thead><tbody>
                              ${cat.items.map((i) => `<tr><td>${i.itemName}</td><td class="r">${i.qty}</td><td class="r">${formatKES(i.totalCents)}</td></tr>`).join('')}
                              </tbody></table>`
                            ).join('');
                            const mpesaRows = emp.mpesaPayments.length
                              ? `<h2 style="border-left-color:#059669">M-Pesa Transactions (${emp.mpesaPayments.length}) &mdash; ${formatKES(emp.mpesaTotalCents)}</h2>
                                 <table><thead><tr><th>Reference</th><th>Receipt</th><th>Time</th><th class="r">Amount</th></tr></thead><tbody>
                                 ${emp.mpesaPayments.map((p) => `<tr><td>${p.mpesaRef ?? 'M-PESA'}</td><td>${p.saleReceiptNumber ?? '—'}</td><td>${new Date(p.createdAt).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</td><td class="r">${formatKES(p.amountCents)}</td></tr>`).join('')}
                                 </tbody></table>` : '';
                            const cashExp = formatKES(emp.totalCents - emp.mpesaTotalCents);
                            printHtml(`${emp.employeeName} — Sales Report`, `<h1>${emp.employeeName}</h1><p class="sub">${emp.role} &bull; ${dateLabel} &bull; ${emp.salesCount} sales</p>${catRows}${mpesaRows}<div class="grand">Cash Expected: ${cashExp} &nbsp;(Total ${formatKES(emp.totalCents)} &minus; M-Pesa ${formatKES(emp.mpesaTotalCents)})</div>`);
                          }}
                          className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Print this employee's report"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Category breakdown */}
                    {emp.categories.length > 0 && (
                      <div className="divide-y divide-gray-50">
                        {emp.categories.map((cat) => (
                          <div key={cat.name} className="px-5 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat.name}</span>
                              <span className="text-xs font-semibold text-gray-700">{formatKES(cat.subtotalCents)}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-400">
                                  <th className="text-left font-medium pb-1">Item</th>
                                  <th className="text-right font-medium pb-1">Qty</th>
                                  <th className="text-right font-medium pb-1">Revenue</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cat.items.map((item) => (
                                  <tr key={item.itemName} className="hover:bg-gray-50">
                                    <td className="py-1 text-gray-800">{item.itemName}</td>
                                    <td className="py-1 text-right text-gray-600">{item.qty}</td>
                                    <td className="py-1 text-right font-medium text-gray-800">{formatKES(item.totalCents)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* M-Pesa transactions */}
                    {emp.mpesaPayments.length > 0 && (
                      <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Smartphone className="w-4 h-4 text-emerald-600" />
                          <span className="text-sm font-semibold text-emerald-800">M-Pesa Transactions ({emp.mpesaPayments.length})</span>
                          <span className="ml-auto text-sm font-bold text-emerald-700">{formatKES(emp.mpesaTotalCents)}</span>
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {emp.mpesaPayments.map((pmt, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs bg-white rounded-lg px-3 py-2 border border-emerald-100">
                              <div>
                                <span className="font-medium text-gray-800">{pmt.mpesaRef ?? 'M-PESA'}</span>
                                {pmt.saleReceiptNumber && <span className="text-gray-400 ml-2">Receipt {pmt.saleReceiptNumber}</span>}
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-emerald-700">{formatKES(pmt.amountCents)}</span>
                                <span className="text-gray-400 ml-2">{new Date(pmt.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {employeeSalesData?.rows.length === 0 && (
                  <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No employee sales data for this period.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── LAYAWAY BOOK ── */}
            {tab === 'layaway' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-sm font-medium text-gray-700">Status filter:</label>
                  {['', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setLayawayStatus(s)}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${layawayStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {s || 'All'}
                    </button>
                  ))}
                </div>

                {layawayBook && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard label="Active" value={layawayBook.summary.activeCount} icon={BookOpen} color="bg-blue-500" />
                      <StatCard label="Total Value" value={formatKES(layawayBook.summary.totalValueCents)} icon={DollarSign} color="bg-green-500" />
                      <StatCard label="Collected" value={formatKES(layawayBook.summary.totalPaidCents)} icon={TrendingUp} color="bg-emerald-500" />
                      <StatCard label="Outstanding" value={formatKES(layawayBook.summary.totalRemainingCents)} icon={AlertCircle} color="bg-orange-500" />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Layaway Book ({layawayBook.summary.count})</h2>
                        <button
                          onClick={() => {
                            if (!layawayBook.rows.length) return;
                            downloadCsv(`layaway-book-${startDate}-${endDate}.csv`, [
                              ['Customer', 'Phone', 'Status', 'Total (KES)', 'Paid (KES)', 'Remaining (KES)', 'Payments', 'Days', 'Created'],
                              ...layawayBook.rows.map((r) => [
                                r.customerName, r.customerPhone, r.status,
                                (r.totalCents / 100).toFixed(2), (r.paidCents / 100).toFixed(2),
                                (r.remainingCents / 100).toFixed(2), String(r.paymentCount),
                                String(r.daysSinceCreated), new Date(r.createdAt).toLocaleDateString('en-KE'),
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Customer</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Paid</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Remaining</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Days</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {layawayBook.rows.length === 0 ? (
                              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No layaway records</td></tr>
                            ) : layawayBook.rows.map((r) => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-5 py-3">
                                  <div className="font-medium">{r.customerName}</div>
                                  {r.customerPhone && <div className="text-xs text-gray-400">{r.customerPhone}</div>}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : r.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-right">{formatKES(r.totalCents)}</td>
                                <td className="px-5 py-3 text-right text-green-600">{formatKES(r.paidCents)}</td>
                                <td className="px-5 py-3 text-right font-semibold text-orange-600">{formatKES(r.remainingCents)}</td>
                                <td className="px-5 py-3 text-center text-gray-500">{r.daysSinceCreated}d</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── PROFORMA PIPELINE ── */}
            {tab === 'proforma' && (
              <div className="space-y-4">
                {proformaPipeline && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard label="Active" value={proformaPipeline.summary.active} icon={ClipboardList} color="bg-blue-500" sub={`Pipeline: ${formatKES(proformaPipeline.summary.pipelineValueCents)}`} />
                      <StatCard label="Expired" value={proformaPipeline.summary.expired} icon={AlertCircle} color="bg-red-500" />
                      <StatCard label="Converted" value={proformaPipeline.summary.converted} icon={TrendingUp} color="bg-green-500" />
                      <StatCard label="Total Value" value={formatKES(proformaPipeline.summary.totalValueCents)} icon={DollarSign} color="bg-purple-500" />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Proforma Pipeline ({proformaPipeline.summary.total})</h2>
                        <button
                          onClick={() => {
                            if (!proformaPipeline.rows.length) return;
                            downloadCsv(`proforma-pipeline.csv`, [
                              ['Receipt #', 'Status', 'Customer', 'Total (KES)', 'Items', 'Created', 'Valid Until', 'Days Remaining'],
                              ...proformaPipeline.rows.map((r) => [
                                r.receiptNumber ?? '', r.status, r.customerName,
                                (r.totalCents / 100).toFixed(2), String(r.itemCount),
                                new Date(r.createdAt).toLocaleDateString('en-KE'),
                                r.validUntil ? new Date(r.validUntil).toLocaleDateString('en-KE') : '',
                                r.daysRemaining !== null ? String(r.daysRemaining) : '',
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Customer</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                              <th className="text-right px-5 py-3 font-medium text-gray-600">Total</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Valid Until</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Days</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {proformaPipeline.rows.length === 0 ? (
                              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No proforma invoices</td></tr>
                            ) : proformaPipeline.rows.map((r) => (
                              <tr key={r.id} className={`hover:bg-gray-50 ${r.isUrgent ? 'bg-amber-50' : ''}`}>
                                <td className="px-5 py-3 font-mono text-xs text-blue-600">{r.receiptNumber ?? '—'}</td>
                                <td className="px-5 py-3">
                                  <div className="font-medium">{r.customerName}</div>
                                  {r.customerPhone && <div className="text-xs text-gray-400">{r.customerPhone}</div>}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.status === 'DRAFT' ? 'bg-blue-100 text-blue-700' : r.status === 'EXPIRED' ? 'bg-red-100 text-red-700' : r.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-right font-semibold">{formatKES(r.totalCents)}</td>
                                <td className="px-5 py-3 text-center text-gray-500 text-xs">
                                  {r.validUntil ? new Date(r.validUntil).toLocaleDateString('en-KE') : '—'}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  {r.daysRemaining !== null ? (
                                    <span className={`text-xs font-semibold ${r.isExpired ? 'text-red-600' : r.isUrgent ? 'text-amber-600' : 'text-gray-600'}`}>
                                      {r.isExpired ? 'Expired' : `${r.daysRemaining}d`}
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── SERIAL REGISTRY ── */}
            {tab === 'serials' && (
              <div className="space-y-4">
                {serialRegistry && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard label="Total Serials" value={serialRegistry.summary.total} icon={Hash} color="bg-blue-500" />
                      <StatCard label="Available" value={serialRegistry.summary.available} icon={Package} color="bg-green-500" />
                      <StatCard label="Sold" value={serialRegistry.summary.sold} icon={ShoppingBag} color="bg-purple-500" />
                      <StatCard label="Reserved" value={serialRegistry.summary.reserved} icon={AlertCircle} color="bg-amber-500" />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-800">Serial Number Registry</h2>
                        <button
                          onClick={() => {
                            if (!serialRegistry.rows.length) return;
                            downloadCsv(`serial-registry.csv`, [
                              ['Serial Number', 'Status', 'Item', 'Category', 'Receipt #', 'Sold Date', 'Customer'],
                              ...serialRegistry.rows.map((r) => [
                                r.serialNumber, r.status, r.itemName, r.category,
                                r.saleReceiptNumber ?? '', r.soldAt ? new Date(r.soldAt).toLocaleDateString('en-KE') : '',
                                r.customerName ?? '',
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Serial Number</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Item</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Receipt #</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Customer</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Sold Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {serialRegistry.rows.length === 0 ? (
                              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No serial records</td></tr>
                            ) : serialRegistry.rows.map((r) => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-5 py-3 font-mono text-xs font-bold">{r.serialNumber}</td>
                                <td className="px-5 py-3">
                                  <div className="font-medium">{r.itemName}</div>
                                  {r.category && <div className="text-xs text-gray-400">{r.category}</div>}
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' : r.status === 'SOLD' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3 font-mono text-xs text-blue-600">{r.saleReceiptNumber ?? '—'}</td>
                                <td className="px-5 py-3 text-gray-600">{r.customerName ?? '—'}</td>
                                <td className="px-5 py-3 text-gray-500 text-xs">
                                  {r.soldAt ? new Date(r.soldAt).toLocaleDateString('en-KE') : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── GRN DISCREPANCY ── */}
            {tab === 'grn' && (
              <div className="space-y-4">
                {grnDiscrepancy && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <StatCard label="Total GRN Lines" value={grnDiscrepancy.summary.totalLines} icon={Truck} color="bg-blue-500" />
                      <StatCard label="Discrepancies" value={grnDiscrepancy.summary.discrepancyCount} icon={AlertTriangle} color={grnDiscrepancy.summary.discrepancyCount > 0 ? 'bg-red-500' : 'bg-green-500'} />
                      <StatCard label="Short Deliveries" value={grnDiscrepancy.summary.shortDeliveries} icon={Package} color="bg-orange-500" />
                      <StatCard label="Variance Value" value={formatKES(grnDiscrepancy.summary.totalVarianceValueCents)} icon={DollarSign} color="bg-purple-500" />
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b flex justify-between items-center">
                        <div>
                          <h2 className="font-semibold text-gray-800">GRN Discrepancy Report</h2>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Discrepancy rate: {grnDiscrepancy.summary.discrepancyRate}%
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (!grnDiscrepancy.rows.length) return;
                            downloadCsv(`grn-discrepancy-${startDate}-${endDate}.csv`, [
                              ['PO Number', 'Supplier', 'Received Date', 'Ordered', 'Received', 'Variance', 'Variance %', 'Type', 'Lot #'],
                              ...grnDiscrepancy.rows.map((r) => [
                                r.poNumber, r.supplierName,
                                new Date(r.receivedAt).toLocaleDateString('en-KE'),
                                String(r.quantityOrdered), String(r.quantityReceived),
                                String(r.variance), r.variancePct.toFixed(1) + '%',
                                r.discrepancyType, r.batchLotNumber ?? '',
                              ]),
                            ]);
                          }}
                          className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
                        >
                          <Download className="w-4 h-4" /> Export CSV
                        </button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">PO Number</th>
                              <th className="text-left px-5 py-3 font-medium text-gray-600">Supplier</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Ordered</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Received</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Variance</th>
                              <th className="text-center px-5 py-3 font-medium text-gray-600">Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {grnDiscrepancy.rows.length === 0 ? (
                              <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No GRN data for this period</td></tr>
                            ) : grnDiscrepancy.rows.map((r, i) => (
                              <tr key={i} className={`hover:bg-gray-50 ${r.hasDiscrepancy ? 'bg-red-50/30' : ''}`}>
                                <td className="px-5 py-3 font-mono text-xs text-blue-600">{r.poNumber}</td>
                                <td className="px-5 py-3 font-medium">{r.supplierName}</td>
                                <td className="px-5 py-3 text-center">{r.quantityOrdered}</td>
                                <td className="px-5 py-3 text-center">{r.quantityReceived}</td>
                                <td className={`px-5 py-3 text-center font-semibold ${r.variance < 0 ? 'text-red-600' : r.variance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                  {r.variance > 0 ? '+' : ''}{r.variance} ({r.variancePct > 0 ? '+' : ''}{r.variancePct}%)
                                </td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.discrepancyType === 'MATCH' ? 'bg-green-100 text-green-700' : r.discrepancyType === 'SHORT' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {r.discrepancyType}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── KRA EXPORT ── */}
            {tab === 'kra' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-green-100 p-3 rounded-xl">
                      <Flag className="w-6 h-6 text-green-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">KRA-Formatted Tax Export</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Downloads all VAT/TOT sales data in KRA eTIMS-compatible JSON format for the selected period.
                        Includes eTIMS control numbers and submission status.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        const data = await api.get(`/reports/kra-export?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`);
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `kra-export-${startDate.substring(0, 10)}-to-${endDate.substring(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-5 py-3 bg-green-700 hover:bg-green-800 text-white rounded-lg font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download KRA JSON Export
                    </button>
                    <button
                      onClick={async () => {
                        const data: any = await api.get(`/reports/kra-export?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`);
                        const rows: string[][] = [
                          ['Receipt Number', 'Date', 'eTIMS Control', 'eTIMS Submitted', 'Subtotal (KES)', 'VAT (KES)', 'TOT (KES)', 'Total (KES)'],
                          ...data.transactions.map((t: any) => [
                            t.receiptNumber ?? '',
                            new Date(t.date).toLocaleDateString('en-KE'),
                            t.etimsControlNumber ?? '',
                            t.etimsSubmitted ? 'YES' : 'NO',
                            (t.subtotalCents / 100).toFixed(2),
                            (t.vatCents / 100).toFixed(2),
                            (t.totCents / 100).toFixed(2),
                            (t.totalCents / 100).toFixed(2),
                          ]),
                        ];
                        downloadCsv(`kra-export-${startDate.substring(0, 10)}.csv`, rows);
                      }}
                      className="flex items-center gap-2 px-5 py-3 bg-white border border-green-700 text-green-700 hover:bg-green-50 rounded-lg font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download KRA CSV Export
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── AUDIT LOG ── */}
            {tab === 'audit' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-blue-100 p-3 rounded-xl">
                      <Shield className="w-6 h-6 text-blue-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Tamper-Evident Audit Log Export</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Exports the SHA-256 hash-chained audit log. Each entry includes previousHash and hash for chain verification.
                        The chain integrity is verified on export.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        const data: any = await api.get(`/reports/audit-log-export?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`);
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `audit-log-${startDate.substring(0, 10)}-to-${endDate.substring(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-5 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download Audit Log (JSON with hash chain)
                    </button>
                    <button
                      onClick={async () => {
                        const data: any = await api.get(`/reports/audit-log-export?businessId=${businessId}&startDate=${startDate}&endDate=${endDate}`);
                        const rows: string[][] = [
                          ['Seq', 'Date', 'Actor', 'Action', 'Entity', 'Entity ID', 'Chain Valid', 'Hash (first 16)'],
                          ...data.entries.map((e: any) => [
                            String(e.sequence),
                            new Date(e.createdAt).toLocaleString('en-KE'),
                            e.actor, e.action, e.entity, e.entityId,
                            e.chainValid ? 'YES' : 'TAMPERED',
                            e.hash.substring(0, 16) + '...',
                          ]),
                        ];
                        downloadCsv(`audit-log-${startDate.substring(0, 10)}.csv`, rows);
                      }}
                      className="flex items-center gap-2 px-5 py-3 bg-white border border-blue-700 text-blue-700 hover:bg-blue-50 rounded-lg font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download Audit Log CSV
                    </button>
                    <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-2">
                      <Shield className="w-3.5 h-3.5" />
                      Chain integrity is verified automatically. TAMPERED entries indicate potential data modification.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── FULL DATA EXPORT ── */}
            {tab === 'export' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="bg-purple-100 p-3 rounded-xl">
                      <DatabaseBackup className="w-6 h-6 text-purple-700" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Full Data Export</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Exports all business data: items, sales (last 10,000), customers, expenses, suppliers, employees.
                        Use for data portability, backup, or migration.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={async () => {
                        const data = await api.get(`/reports/full-data-export?businessId=${businessId}`);
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `full-export-${new Date().toISOString().substring(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-2 px-5 py-3 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-medium"
                    >
                      <Download className="w-4 h-4" />
                      Download Full Data Export (JSON)
                    </button>
                    <p className="text-xs text-gray-400">
                      Note: Large datasets may take a moment to generate. Sales limited to last 10,000 transactions.
                    </p>
                  </div>
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
