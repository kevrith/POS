import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, DollarSign, TrendingUp, TrendingDown, Package,
  AlertTriangle, CreditCard, Users, BarChart3, ChevronRight,
  RefreshCw, Coffee, Wallet, Zap, Clock, CheckCircle2, MessageSquare, Check, Lock,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES, Feature } from '@pos/shared';
import { useFeatureAccess } from '../hooks/useFeatureAccess';
import UpgradeModal from '../components/UpgradeModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SalesSummary {
  totalSales: number;
  totalRevenueCents: number;
  totalVatCents: number;
}

interface SalesReport {
  summary: SalesSummary;
  sales: Array<{
    id: string;
    receiptNumber?: string;
    totalCents: number;
    createdAt: string;
    cashierId?: string;
    status: string;
  }>;
}

interface PaymentMethod {
  method: string;
  totalCents: number;
  count: number;
}

interface LowStockItem {
  id: string;
  name: string;
  reorderLevel: number;
  stockLevel?: number;
}

interface PLData {
  revenueCents: number;
  expensesCents: number;
  netProfitCents: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function thisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function lastMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function pct(current: number, prev: number) {
  if (prev === 0) return current > 0 ? 100 : 0;
  return ((current - prev) / prev) * 100;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Mini Trend Arrow ─────────────────────────────────────────────────────────

function Trend({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, trend, accent, valueColor,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; trend?: number; accent: string; valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-card hover:shadow-card-hover transition-all duration-200 p-5 flex flex-col gap-3 group">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em]">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent} group-hover:scale-110 transition-transform duration-200`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-extrabold tracking-tight tabular-nums ${valueColor ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {trend !== undefined && <Trend value={trend} />}
    </div>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

function QuickAction({ icon: Icon, label, desc, onClick, color, locked, badge }: {
  icon: React.ElementType; label: string; desc: string; onClick: () => void; color: string;
  locked?: boolean; badge?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`flex items-center gap-3 p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/60 rounded-xl hover:shadow-card-hover hover:border-blue-100 dark:hover:border-gray-600 transition-all duration-200 text-left group active:scale-[0.98] relative ${
        locked ? 'opacity-60 cursor-not-allowed' : ''
      }`}
    >
      {badge && (
        <span className="absolute -top-2 -right-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
          {badge}
        </span>
      )}
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200 relative`}>
        <Icon className="w-5 h-5" />
        {locked && (
          <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
            <Lock className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{desc}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
    </button>
  );
}

// ─── Payment Method Icon ──────────────────────────────────────────────────────

function methodLabel(m: string) {
  const map: Record<string, string> = {
    CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card',
    GIFT_CARD: 'Gift Card', BANK_TRANSFER: 'Bank Transfer',
    ROOM_CHARGE: 'Room Charge', SPLIT: 'Split',
  };
  return map[m] ?? m;
}

const METHOD_COLORS: Record<string, string> = {
  CASH: 'bg-emerald-500', MPESA: 'bg-green-600', CARD: 'bg-blue-500',
  GIFT_CARD: 'bg-purple-500', BANK_TRANSFER: 'bg-sky-500',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const role = user?.role ?? '';
  
  const [upgradeModal, setUpgradeModal] = useState<{
    isOpen: boolean;
    featureName: string;
    requiredTier: any;
  }>({ isOpen: false, featureName: '', requiredTier: null });

  // Feature access checks
  const hospitalityAccess = useFeatureAccess(Feature.HOSPITALITY);
  const inventoryAccess = useFeatureAccess(Feature.INVENTORY);
  const reportsAccess = useFeatureAccess(Feature.REPORTS_ADVANCED);
  const stocktakeAccess = useFeatureAccess(Feature.STOCKTAKE);
  const ownerDashboardAccess = useFeatureAccess(Feature.OWNER_DASHBOARD);

  const handleFeatureClick = (feature: { hasAccess: boolean; requiredTier?: any }, featureName: string, navigateTo: string) => {
    if (feature.hasAccess) {
      navigate(navigateTo);
    } else if (feature.requiredTier) {
      setUpgradeModal({
        isOpen: true,
        featureName,
        requiredTier: feature.requiredTier,
      });
    }
  };

  const { start: monthStart, end: monthEnd } = thisMonthRange();
  const { start: prevMonthStart, end: prevMonthEnd } = lastMonthRange();
  const { start: todayStart, end: todayEnd } = todayRange();

  const { data: today, isLoading, refetch } = useQuery<SalesReport>({
    queryKey: ['dashboard-month', businessId, storeId, monthStart],
    queryFn: () =>
      api.get(`/reports/sales?businessId=${businessId}&storeId=${storeId}&startDate=${monthStart}&endDate=${monthEnd}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const { data: yesterday } = useQuery<SalesReport>({
    queryKey: ['dashboard-prev-month', businessId, storeId, prevMonthStart],
    queryFn: () =>
      api.get(`/reports/sales?businessId=${businessId}&storeId=${storeId}&startDate=${prevMonthStart}&endDate=${prevMonthEnd}`),
    enabled: !!businessId,
  });

  const { data: todayData } = useQuery<SalesReport>({
    queryKey: ['dashboard-today', businessId, storeId, todayStart],
    queryFn: () =>
      api.get(`/reports/sales?businessId=${businessId}&storeId=${storeId}&startDate=${todayStart}&endDate=${todayEnd}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const { data: payments } = useQuery<PaymentMethod[]>({
    queryKey: ['dashboard-payments', businessId, storeId, monthStart],
    queryFn: () =>
      api.get(`/reports/payment-methods?businessId=${businessId}&storeId=${storeId}&startDate=${monthStart}&endDate=${monthEnd}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const { data: lowStock } = useQuery<LowStockItem[]>({
    queryKey: ['dashboard-low-stock', businessId, storeId],
    queryFn: () =>
      api.get(`/items/low-stock?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && ['OWNER', 'MANAGER'].includes(role),
    refetchInterval: 300000,
  });

  const { data: stockRequests = [] } = useQuery<{ id: string; title: string; body: string; createdAt: string }[]>({
    queryKey: ['dashboard-stock-requests', businessId],
    queryFn: () => api.get(`/notifications?businessId=${businessId}&type=STOCK_REQUEST&unreadOnly=true`),
    enabled: !!businessId && ['OWNER', 'MANAGER'].includes(role),
    refetchInterval: 120_000,
  });

  const markRequestDoneMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-stock-requests', businessId] });
      qc.invalidateQueries({ queryKey: ['notifications-stock-requests', businessId] });
    },
  });

  const { data: plData } = useQuery<PLData>({
    queryKey: ['dashboard-pl', businessId, storeId, monthStart],
    queryFn: () =>
      api.get(`/reports/profit-loss?businessId=${businessId}&storeId=${storeId}&startDate=${monthStart}&endDate=${monthEnd}`),
    enabled: !!businessId && ['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(role),
    refetchInterval: 60000,
  });

  // ── Derived values ──
  const todayRev = today?.summary.totalRevenueCents ?? 0;
  const todayTx = today?.summary.totalSales ?? 0;
  const todayVat = today?.summary.totalVatCents ?? 0;
  const prevRev = yesterday?.summary.totalRevenueCents ?? 0;
  const prevTx = yesterday?.summary.totalSales ?? 0;
  const avgTicket = todayTx > 0 ? todayRev / todayTx : 0;
  const prevAvg = (yesterday?.summary.totalSales ?? 0) > 0
    ? (yesterday?.summary.totalRevenueCents ?? 0) / (yesterday?.summary.totalSales ?? 1) : 0;

  const recentSales = useMemo(
    () => (today?.sales ?? []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8),
    [today],
  );

  // Hourly buckets (0–23) for today's sales only
  const hourlyBuckets = useMemo(() => {
    const buckets = new Array(24).fill(0);
    (todayData?.sales ?? []).forEach((s) => {
      const h = new Date(s.createdAt).getHours();
      buckets[h] += s.totalCents;
    });
    return buckets;
  }, [todayData]);

  const maxBucket = Math.max(...hourlyBuckets, 1);
  const currentHour = new Date().getHours();

  const totalPayments = (payments ?? []).reduce((s, p) => s + p.totalCents, 0);

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-950 animate-fade-in">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 text-xs font-semibold uppercase tracking-widest">Live · This Month</span>
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                {greeting}, {user?.name?.split(' ')[0] ?? 'there'}
              </h1>
              <p className="text-blue-200 text-sm mt-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> {dateStr}
              </p>
            </div>
            <button
              onClick={() => void refetch()}
              className="p-2 text-blue-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {[
              { label: 'Month Revenue', value: formatKES(todayRev), trend: pct(todayRev, prevRev), icon: DollarSign, color: 'text-emerald-300' },
              { label: 'Transactions', value: todayTx.toString(), trend: pct(todayTx, prevTx), icon: ShoppingCart, color: 'text-blue-200' },
              { label: 'Avg Ticket', value: formatKES(avgTicket), trend: pct(avgTicket, prevAvg), icon: CreditCard, color: 'text-purple-300' },
              { label: 'VAT Collected', value: formatKES(todayVat), trend: undefined as number | undefined, icon: BarChart3, color: 'text-amber-300' },
            ].map(({ label, value, trend, icon: Icon, color }) => (
              <div key={label} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-blue-200/70 font-medium">{label}</span>
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                </div>
                <p className={`text-xl font-black ${color} tabular-nums`}>{value}</p>
                {trend !== undefined && (
                  <span className={`text-xs flex items-center gap-0.5 mt-0.5 ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(trend).toFixed(1)}% vs last month
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ── P&L row (managers/owners) ── */}
        {plData && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Month Revenue"
              value={formatKES(plData.revenueCents)}
              sub="Confirmed sales"
              icon={TrendingUp}
              accent="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              valueColor="text-emerald-600 dark:text-emerald-400"
            />
            <KpiCard
              label="Month Expenses"
              value={formatKES(plData.expensesCents)}
              sub="Approved expenses"
              icon={DollarSign}
              accent="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              valueColor="text-red-600 dark:text-red-400"
            />
            <KpiCard
              label="Net Profit"
              value={formatKES(plData.netProfitCents)}
              sub={plData.revenueCents > 0
                ? `${((plData.netProfitCents / plData.revenueCents) * 100).toFixed(1)}% margin`
                : 'No revenue yet'}
              icon={plData.netProfitCents >= 0 ? TrendingUp : TrendingDown}
              accent={plData.netProfitCents >= 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'}
              valueColor={plData.netProfitCents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
            />
          </div>
        )}

        {/* ── Hourly chart + Payment methods ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Hourly bars */}
          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Hourly Revenue</h2>
              </div>
              <span className="text-xs text-gray-400">Today</span>
            </div>
            <div className="flex items-end gap-1 h-28">
              {hourlyBuckets.map((v, h) => {
                const frac = v / maxBucket;
                const isCurrent = h === currentHour;
                return (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div
                      className={`w-full rounded-t transition-all duration-500 ${isCurrent ? 'bg-blue-500' : v > 0 ? 'bg-blue-300 dark:bg-blue-700' : 'bg-gray-100 dark:bg-gray-700'}`}
                      style={{ height: `${Math.max(frac * 96, v > 0 ? 4 : 2)}px` }}
                    />
                    {(h % 4 === 0) && (
                      <span className="text-[9px] text-gray-400">{h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</span>
                    )}
                    {v > 0 && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {formatKES(v)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment methods */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-purple-600" />
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Payment Methods</h2>
            </div>
            {(payments ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <CreditCard className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No payments this month</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50 px-5 py-2">
                {(payments ?? []).map((p) => {
                  const share = totalPayments > 0 ? (p.totalCents / totalPayments) * 100 : 0;
                  const color = METHOD_COLORS[p.method] ?? 'bg-gray-400';
                  return (
                    <div key={p.method} className="py-3">
                      <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${color}`} />
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{methodLabel(p.method)}</span>
                          <span className="text-xs text-gray-400">×{p.count}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{formatKES(p.totalCents)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Low stock alerts + Recent sales ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Recent sales */}
          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Recent Sales</h2>
              </div>
              <button
                onClick={() => navigate('/sales-list')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {recentSales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShoppingCart className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No sales this month yet</p>
                <button
                  onClick={() => navigate('/pos')}
                  className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700"
                >
                  Open POS
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {recentSales.map((s) => (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {s.receiptNumber ?? `#${s.id.slice(-6)}`}
                      </p>
                      <p className="text-xs text-gray-400">{relTime(s.createdAt)}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{formatKES(s.totalCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Low stock alerts */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Low Stock</h2>
                {(lowStock?.length ?? 0) > 0 && (
                  <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-2 py-0.5 rounded-full">
                    {lowStock!.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/inventory')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                Manage <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            {!['OWNER', 'MANAGER'].includes(role) ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 px-4 text-center">
                <Package className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">Inventory access restricted</p>
              </div>
            ) : (lowStock?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <CheckCircle2 className="w-8 h-8 mb-2 text-emerald-400 opacity-60" />
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">All items well-stocked</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {(lowStock ?? []).slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate">{item.name}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-red-500">{item.stockLevel ?? 0} left</p>
                      <p className="text-[10px] text-gray-400">min {item.reorderLevel}</p>
                    </div>
                  </div>
                ))}
                {(lowStock?.length ?? 0) > 6 && (
                  <div className="px-5 py-2 text-xs text-gray-400 text-center">
                    +{lowStock!.length - 6} more items
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Stock Requests Card (OWNER/MANAGER only) ── */}
        {['OWNER', 'MANAGER'].includes(role) && stockRequests.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-orange-100 dark:border-orange-900/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-orange-50 dark:border-orange-900/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-orange-500" />
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">Customer Stock Requests</h2>
                <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 font-bold px-2 py-0.5 rounded-full">
                  {stockRequests.length}
                </span>
              </div>
              <button
                onClick={() => navigate('/inventory')}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                Go to Inventory <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {stockRequests.slice(0, 8).map((req) => (
                <div key={req.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-7 h-7 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{req.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{req.body}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(req.createdAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <button
                    onClick={() => markRequestDoneMutation.mutate(req.id)}
                    title="Mark as done / restocked"
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 transition-colors mt-0.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {stockRequests.length > 8 && (
                <div className="px-5 py-2 text-xs text-gray-400 text-center">
                  +{stockRequests.length - 8} more requests
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Quick Actions ── */}
        <div>
          <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-500" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction
              icon={ShoppingCart}
              label="Point of Sale"
              desc="Serve customers"
              onClick={() => navigate('/pos')}
              color="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            />
            {['OWNER', 'MANAGER', 'WAITER'].includes(role) && (
              <QuickAction
                icon={Coffee}
                label="Hospitality"
                desc={hospitalityAccess.hasAccess ? 'Tables & orders' : 'Upgrade to unlock'}
                onClick={() => handleFeatureClick(hospitalityAccess, 'Hospitality Mode', '/hospitality')}
                color="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                locked={!hospitalityAccess.hasAccess}
                badge={!hospitalityAccess.hasAccess ? hospitalityAccess.requiredTier : undefined}
              />
            )}
            {['OWNER', 'MANAGER'].includes(role) && (
              <QuickAction
                icon={Package}
                label="Inventory"
                desc={inventoryAccess.hasAccess ? 'Stock & items' : 'Upgrade to unlock'}
                onClick={() => handleFeatureClick(inventoryAccess, 'Inventory Management', '/inventory')}
                color="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                locked={!inventoryAccess.hasAccess}
              />
            )}
            <QuickAction
              icon={Wallet}
              label="Cash Drawer"
              desc="Open / close session"
              onClick={() => navigate('/cash-drawer')}
              color="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
            />
            {['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(role) && (
              <QuickAction
                icon={BarChart3}
                label="Reports"
                desc={reportsAccess.hasAccess ? 'Revenue, VAT, P&L' : 'Basic reports only'}
                onClick={() => handleFeatureClick(reportsAccess, 'Advanced Reports', '/reports')}
                color="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
              />
            )}
            {['OWNER', 'MANAGER'].includes(role) && (
              <QuickAction
                icon={Users}
                label="Customers"
                desc="CRM & loyalty"
                onClick={() => navigate('/customers')}
                color="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
              />
            )}
            {['OWNER', 'MANAGER'].includes(role) && (
              <QuickAction
                icon={AlertTriangle}
                label="Stocktake"
                desc={stocktakeAccess.hasAccess ? 'Cycle count & variance' : 'Upgrade to unlock'}
                onClick={() => handleFeatureClick(stocktakeAccess, 'Stocktake', '/stocktake')}
                color="bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                locked={!stocktakeAccess.hasAccess}
                badge={!stocktakeAccess.hasAccess ? stocktakeAccess.requiredTier : undefined}
              />
            )}
            {role === 'OWNER' && (
              <QuickAction
                icon={TrendingUp}
                label="Owner Dashboard"
                desc={ownerDashboardAccess.hasAccess ? 'Multi-store analytics' : 'Upgrade to unlock'}
                onClick={() => handleFeatureClick(ownerDashboardAccess, 'Owner Dashboard', '/owner-dashboard')}
                color="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                locked={!ownerDashboardAccess.hasAccess}
                badge={!ownerDashboardAccess.hasAccess ? ownerDashboardAccess.requiredTier : undefined}
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={upgradeModal.isOpen}
        onClose={() => setUpgradeModal({ isOpen: false, featureName: '', requiredTier: null })}
        featureName={upgradeModal.featureName}
        requiredTier={upgradeModal.requiredTier}
        currentTier={user?.planName ?? 'FREE'}
      />
    </div>
  );
}
