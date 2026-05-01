import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, TrendingUp, TrendingDown, Minus,
  RefreshCw, Download, ShoppingCart, Zap, BarChart3,
  Package, ArrowRight, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const formatKES = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ForecastItem {
  itemId: string;
  itemName: string;
  currentStock: number;
  weeklyAvgSales: number;
  trend: number;
  forecastedDemand: number;
  isLowStock: boolean;
  suggestedOrderQty: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface TopMover {
  itemId: string;
  itemName: string;
  totalQty: number;
  totalRevenueCents: number;
}

interface HourlyPattern {
  hour: number;
  avgSales: number;
  avgRevenueCents: number;
}

interface DailyPattern {
  dayOfWeek: number;
  dayName: string;
  avgSales: number;
  avgRevenueCents: number;
}

type Tab = 'demand' | 'movers' | 'seasonal';
type ABCClass = 'A' | 'B' | 'C';

// ─── Derived helpers ─────────────────────────────────────────────────────────

function classifyABC(items: ForecastItem[]): Map<string, ABCClass> {
  const scored = items
    .map((it) => ({ id: it.itemId, score: it.forecastedDemand * it.weeklyAvgSales }))
    .sort((a, b) => b.score - a.score);

  const total = scored.length;
  const map = new Map<string, ABCClass>();
  scored.forEach((s, i) => {
    const rank = i / total;
    map.set(s.id, rank < 0.2 ? 'A' : rank < 0.5 ? 'B' : 'C');
  });
  return map;
}

function daysOfStock(item: ForecastItem): number {
  if (item.currentStock <= 0) return 0;
  const dailyRate = item.weeklyAvgSales / 7;
  if (dailyRate <= 0) return 999;
  return Math.floor(item.currentStock / dailyRate);
}

function abcBadge(cls: ABCClass) {
  const styles: Record<ABCClass, string> = {
    A: 'bg-red-100 text-red-700 ring-1 ring-red-200',
    B: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    C: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',
  };
  const titles: Record<ABCClass, string> = {
    A: 'Critical — reorder urgently',
    B: 'Important — monitor closely',
    C: 'Low priority',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${styles[cls]}`} title={titles[cls]}>
      {cls}
    </span>
  );
}

function dosColor(dos: number): string {
  if (dos === 0) return 'text-red-600 font-bold';
  if (dos < 7) return 'text-red-500 font-semibold';
  if (dos < 14) return 'text-amber-600 font-semibold';
  return 'text-green-600';
}

function rowBg(item: ForecastItem, dos: number): string {
  if (item.isLowStock || dos === 0) return 'bg-red-50 dark:bg-red-900/10';
  if (dos < 7) return 'bg-amber-50 dark:bg-amber-900/10';
  return '';
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, accent, icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: 'red' | 'orange' | 'blue' | 'green';
  icon: React.ElementType;
}) {
  const accents: Record<string, string> = {
    red:    'from-red-500 to-red-600',
    orange: 'from-orange-500 to-amber-500',
    blue:   'from-blue-500 to-indigo-600',
    green:  'from-emerald-500 to-green-600',
  };
  const iconBg: Record<string, string> = {
    red:    'bg-red-400/30',
    orange: 'bg-orange-400/30',
    blue:   'bg-blue-400/30',
    green:  'bg-emerald-400/30',
  };
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${accents[accent]} rounded-2xl p-5 text-white shadow-lg`}>
      <div className={`absolute right-4 top-4 p-2.5 rounded-xl ${iconBg[accent]}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-xs font-medium text-white/75 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-black mt-1">{value}</p>
      {sub && <p className="text-xs text-white/70 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────

function InsightCard({
  title, item, icon: Icon, colorClass, emptyMsg,
}: {
  title: string;
  item?: ForecastItem;
  icon: React.ElementType;
  colorClass: string;
  emptyMsg: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${colorClass}`} />
        <p className={`text-xs font-semibold uppercase tracking-wide ${colorClass}`}>{title}</p>
      </div>
      {item ? (
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{item.itemName}</p>
          <div className="flex gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Stock: <strong className="text-gray-700 dark:text-gray-300">{item.currentStock}</strong></span>
            <span>Demand: <strong className="text-gray-700 dark:text-gray-300">{item.forecastedDemand}</strong></span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">{emptyMsg}</p>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;

  const [tab, setTab] = useState<Tab>('demand');
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState('7d');

  // ── Demand forecast query ──────────────────────────────────────────────────
  const demandParams = new URLSearchParams({ businessId, days: String(days) });
  if (storeId) demandParams.set('storeId', storeId);

  const {
    data: demandRaw,
    isLoading: demandLoading,
    refetch: refetchDemand,
  } = useQuery<{ items: ForecastItem[] } | ForecastItem[]>({
    queryKey: ['forecast-demand', businessId, storeId, days],
    queryFn: () => api.get(`/forecasting/demand?${demandParams}`),
    enabled: !!businessId && tab === 'demand',
    staleTime: 5 * 60 * 1000,
  });
  const forecastData: ForecastItem[] = Array.isArray(demandRaw)
    ? demandRaw
    : (demandRaw as { items: ForecastItem[] })?.items ?? [];

  // ── Top movers query ───────────────────────────────────────────────────────
  const moversParams = new URLSearchParams({ businessId, period });
  if (storeId) moversParams.set('storeId', storeId);

  const {
    data: moversData,
    isLoading: moversLoading,
    refetch: refetchMovers,
  } = useQuery<{ fastMovers: TopMover[]; slowMovers: TopMover[] }>({
    queryKey: ['forecast-movers', businessId, storeId, period],
    queryFn: () => api.get(`/forecasting/top-movers?${moversParams}`),
    enabled: !!businessId && tab === 'movers',
    staleTime: 5 * 60 * 1000,
  });
  const fastMovers = moversData?.fastMovers ?? [];
  const slowMovers = moversData?.slowMovers ?? [];

  // ── Seasonal query ─────────────────────────────────────────────────────────
  const seasonalParams = new URLSearchParams({ businessId });
  if (storeId) seasonalParams.set('storeId', storeId);

  const {
    data: seasonalData,
    isLoading: seasonalLoading,
    refetch: refetchSeasonal,
  } = useQuery<{ hourly: HourlyPattern[]; daily: DailyPattern[] }>({
    queryKey: ['forecast-seasonal', businessId, storeId],
    queryFn: () => api.get(`/forecasting/seasonal?${seasonalParams}`),
    enabled: !!businessId && tab === 'seasonal',
    staleTime: 5 * 60 * 1000,
  });
  const hourly = seasonalData?.hourly ?? [];
  const daily = seasonalData?.daily ?? [];

  const loading = demandLoading || moversLoading || seasonalLoading;

  const refresh = () => {
    if (tab === 'demand') refetchDemand();
    else if (tab === 'movers') refetchMovers();
    else refetchSeasonal();
  };

  // ── Derived analytics ─────────────────────────────────────────────────────
  const abcMap = classifyABC(forecastData);
  const itemsWithDos = forecastData.map((it) => ({ ...it, dos: daysOfStock(it) }));

  const reorderCount = forecastData.filter((it) => it.isLowStock).length;
  const stockoutItems = itemsWithDos.filter((it) => it.dos === 0 && it.forecastedDemand > 0);
  const stockoutCount = stockoutItems.length;
  const criticalItems = itemsWithDos.filter((it) => it.dos > 0 && it.dos < 3);

  const revenueAtRiskCents = forecastData
    .filter((it) => it.isLowStock)
    .reduce((sum, it) => sum + Math.round(it.forecastedDemand * it.weeklyAvgSales * 7 * 100), 0);

  const highMedCount = forecastData.filter(
    (it) => it.confidence === 'HIGH' || it.confidence === 'MEDIUM',
  ).length;
  const avgConfidencePct =
    forecastData.length > 0 ? Math.round((highMedCount / forecastData.length) * 100) : 0;

  // Insights
  const fastestGrowing = forecastData
    .filter((it) => it.trend > 0.1)
    .sort((a, b) => b.trend - a.trend)[0];

  const biggestRisk = forecastData
    .filter((it) => it.isLowStock)
    .sort((a, b) => b.forecastedDemand - a.forecastedDemand)[0];

  const deadStock = forecastData
    .filter((it) => it.trend < -0.2 && it.currentStock > 10)
    .sort((a, b) => b.currentStock - a.currentStock)[0];

  // Peak hours (top 3 by avgSales)
  const peakHours = [...hourly]
    .sort((a, b) => b.avgSales - a.avgSales)
    .slice(0, 3);

  // CSV export
  const exportCSV = () => {
    const rows = [
      ['Item', 'ABC', 'Current Stock', 'Days of Stock', 'Weekly Avg', 'Trend %', `Forecast (${days}d)`, 'Status', 'Order Qty', 'Confidence'],
      ...itemsWithDos.map((it) => [
        it.itemName,
        abcMap.get(it.itemId) ?? 'C',
        String(it.currentStock),
        String(it.dos),
        String(it.weeklyAvgSales),
        `${(it.trend * 100).toFixed(1)}%`,
        String(it.forecastedDemand),
        it.isLowStock ? 'LOW_STOCK' : 'ADEQUATE',
        String(it.suggestedOrderQty),
        it.confidence,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demand-forecast-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxHourlyRevenue = Math.max(...hourly.map((h) => h.avgRevenueCents), 1);
  const maxDailyRevenue = Math.max(...daily.map((d) => d.avgRevenueCents), 1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 px-6 py-8 shadow-xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">AI Demand Forecasting</h1>
              <p className="text-indigo-300 text-sm mt-0.5">
                Predictive analytics · inventory intelligence · reorder alerts
              </p>
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-sm font-medium transition-colors border border-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Items to Reorder"
              value={reorderCount}
              sub={reorderCount > 0 ? 'Low stock items' : 'All stock healthy'}
              accent="red"
              icon={Package}
            />
            <KpiCard
              label="Revenue at Risk"
              value={revenueAtRiskCents > 0 ? formatKES(revenueAtRiskCents) : '—'}
              sub="Est. lost revenue if unstocked"
              accent="orange"
              icon={AlertTriangle}
            />
            <KpiCard
              label="Avg Confidence"
              value={`${avgConfidencePct}%`}
              sub="HIGH + MEDIUM items"
              accent="blue"
              icon={BarChart3}
            />
            <KpiCard
              label="Stockout Risk"
              value={stockoutCount}
              sub="Zero stock, active demand"
              accent={stockoutCount > 0 ? 'red' : 'green'}
              icon={Zap}
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Critical alert banner ── */}
        {criticalItems.length > 0 && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-5 py-3.5 text-sm text-red-800 dark:text-red-300">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="font-medium">
              {criticalItems.length} item{criticalItems.length > 1 ? 's' : ''} will run out within 3 days.
            </span>
            <button
              onClick={() => navigate('/suppliers')}
              className="ml-auto flex items-center gap-1 font-semibold text-red-700 dark:text-red-400 hover:underline whitespace-nowrap"
            >
              Create a Purchase Order <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-100 dark:border-gray-700 w-fit">
          {(['demand', 'movers', 'seasonal'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {t === 'demand' ? 'Demand Forecast' : t === 'movers' ? 'Top / Slow Movers' : 'Seasonal Patterns'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            Demand Forecast Tab
        ════════════════════════════════════════════════════════ */}
        {!loading && tab === 'demand' && (
          <div className="space-y-5">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Forecast period:</span>
              {[7, 14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    days === d
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                  }`}
                >
                  {d}d
                </button>
              ))}

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => navigate('/suppliers?autoFill=forecast')}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Create PO from Forecast
                </button>
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/60 border-b border-gray-100 dark:border-gray-600">
                    {[
                      'Item', 'ABC', 'Stock', 'Days of Stock',
                      'Weekly Avg', `Trend`, `Forecast (${days}d)`,
                      'Status', 'Order Qty', 'Confidence',
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {forecastData.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-gray-400 text-sm">
                        No sales data for forecasting yet. Make some sales first.
                      </td>
                    </tr>
                  )}
                  {itemsWithDos.map((item) => {
                    const abc = abcMap.get(item.itemId) ?? 'C';
                    const dos = item.dos;
                    const trendPct = (item.trend * 100).toFixed(1);
                    const trendPositive = item.trend > 0.05;
                    const trendNegative = item.trend < -0.05;
                    const confidencePct =
                      item.confidence === 'HIGH' ? 85
                      : item.confidence === 'MEDIUM' ? 55
                      : 25;

                    return (
                      <tr key={item.itemId} className={`${rowBg(item, dos)} transition-colors`}>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white max-w-[180px] truncate">
                          {item.itemName}
                        </td>
                        <td className="px-4 py-3">{abcBadge(abc)}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">{item.currentStock}</td>
                        <td className={`px-4 py-3 tabular-nums ${dosColor(dos)}`}>
                          {dos === 999 ? '∞' : dos}
                          <span className="text-xs font-normal text-gray-400 ml-0.5">d</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                          {item.weeklyAvgSales.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {trendPositive ? (
                              <TrendingUp className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                            ) : trendNegative ? (
                              <TrendingDown className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            ) : (
                              <Minus className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            )}
                            <span
                              className={`text-xs font-semibold tabular-nums ${
                                trendPositive ? 'text-green-600' : trendNegative ? 'text-red-600' : 'text-gray-400'
                              }`}
                            >
                              {trendPositive ? '+' : ''}{trendPct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white tabular-nums">
                          {item.forecastedDemand}
                        </td>
                        <td className="px-4 py-3">
                          {item.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                              LOW STOCK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums">
                          {item.suggestedOrderQty > 0 ? item.suggestedOrderQty : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`text-xs font-semibold ${
                                item.confidence === 'HIGH' ? 'text-emerald-600' :
                                item.confidence === 'MEDIUM' ? 'text-amber-600' :
                                'text-gray-500'
                              }`}
                            >
                              {item.confidence}
                            </span>
                            <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  item.confidence === 'HIGH' ? 'bg-emerald-500' :
                                  item.confidence === 'MEDIUM' ? 'bg-amber-500' :
                                  'bg-gray-400'
                                }`}
                                style={{ width: `${confidencePct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Insights row */}
            {forecastData.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                  Insights
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <InsightCard
                    title="Fastest Growing"
                    item={fastestGrowing}
                    icon={TrendingUp}
                    colorClass="text-green-600"
                    emptyMsg="No strongly growing items detected."
                  />
                  <InsightCard
                    title="Biggest Risk"
                    item={biggestRisk}
                    icon={AlertTriangle}
                    colorClass="text-red-500"
                    emptyMsg="No critical low-stock items."
                  />
                  <InsightCard
                    title="Dead Stock"
                    item={deadStock}
                    icon={Package}
                    colorClass="text-amber-600"
                    emptyMsg="No excess slow-moving stock detected."
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            Top / Slow Movers Tab
        ════════════════════════════════════════════════════════ */}
        {!loading && tab === 'movers' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Period:</span>
              {[['7d', '7 days'], ['14d', '14 days'], ['30d', '30 days']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPeriod(val)}
                  className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    period === val
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Fast Movers */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <h3 className="font-bold text-gray-900 dark:text-white">Fast Movers</h3>
                  {fastMovers.length > 0 && (
                    <span className="ml-auto text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Top {fastMovers.length}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {fastMovers.length === 0 && (
                    <p className="px-5 py-8 text-center text-gray-400 text-sm">No data for this period.</p>
                  )}
                  {fastMovers.map((m, i) => {
                    const maxQty = fastMovers[0]?.totalQty || 1;
                    const barPct = Math.round((m.totalQty / maxQty) * 100);
                    return (
                      <div key={m.itemId} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-gray-400 w-5 flex-shrink-0">#{i + 1}</span>
                            <span className="font-medium text-gray-800 dark:text-white text-sm truncate">{m.itemName}</span>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">{m.totalQty} units</span>
                            <span className="text-sm font-semibold text-green-600">{formatKES(m.totalRevenueCents)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-green-400 rounded-full" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Slow Movers */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <h3 className="font-bold text-gray-900 dark:text-white">Slow Movers</h3>
                  {slowMovers.length > 0 && (
                    <span className="ml-auto text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      Bottom {slowMovers.length}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-gray-50 dark:divide-gray-700">
                  {slowMovers.length === 0 && (
                    <p className="px-5 py-8 text-center text-gray-400 text-sm">No data for this period.</p>
                  )}
                  {slowMovers.map((m) => (
                    <div key={m.itemId} className="px-5 py-3 flex items-center justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-300 text-sm truncate">{m.itemName}</span>
                      <div className="flex items-center gap-4 flex-shrink-0 ml-2">
                        <span className="text-sm text-red-500 tabular-nums font-semibold">{m.totalQty} units</span>
                        <span className="text-sm text-gray-400 tabular-nums">{formatKES(m.totalRevenueCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            Seasonal Patterns Tab
        ════════════════════════════════════════════════════════ */}
        {!loading && tab === 'seasonal' && (
          <div className="space-y-6">
            {/* Peak hours insight */}
            {peakHours.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <h3 className="font-bold text-gray-900 dark:text-white">Peak Hours Insight</h3>
                </div>
                <div className="flex flex-wrap gap-3">
                  {peakHours.map((h, i) => (
                    <div
                      key={h.hour}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${
                        i === 0
                          ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                      }`}
                    >
                      <div className="text-center">
                        <p className="text-xl font-black text-gray-900 dark:text-white">
                          {h.hour.toString().padStart(2, '0')}:00
                        </p>
                        {i === 0 && <p className="text-xs text-amber-600 font-semibold">Busiest</p>}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 space-y-0.5">
                        <p><span className="font-semibold text-gray-700 dark:text-gray-200">{h.avgSales.toFixed(1)}</span> avg sales</p>
                        <p className="text-xs">{formatKES(h.avgRevenueCents)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hourly heat map */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Hourly Sales Heatmap</h3>
              <p className="text-xs text-gray-400 mb-4">Average over last 30 days — darker = higher revenue</p>
              {hourly.length === 0 && <p className="text-gray-400 text-sm">No hourly data yet.</p>}
              <div className="flex gap-1.5 flex-wrap">
                {hourly.map((h) => {
                  const intensity = maxHourlyRevenue > 0 ? h.avgRevenueCents / maxHourlyRevenue : 0;
                  const bg = `rgba(99,102,241,${Math.max(0.06, intensity * 0.9)})`;
                  return (
                    <div
                      key={h.hour}
                      title={`${h.hour}:00 — ${h.avgSales.toFixed(1)} avg sales · ${formatKES(h.avgRevenueCents)}`}
                      className="flex flex-col items-center rounded-lg p-2 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                      style={{ background: bg, minWidth: 44 }}
                    >
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-100">{h.hour}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{h.avgSales.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Daily bar chart */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">Day of Week Performance</h3>
              {daily.length === 0 && <p className="text-gray-400 text-sm">No daily data yet.</p>}
              <div className="space-y-3">
                {daily.map((d) => {
                  const pct = maxDailyRevenue > 0 ? (d.avgRevenueCents / maxDailyRevenue) * 100 : 0;
                  const isTop = d.avgRevenueCents === maxDailyRevenue;
                  return (
                    <div key={d.dayOfWeek} className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300 w-24 shrink-0">
                        {d.dayName}
                        {isTop && (
                          <span className="ml-1.5 text-xs text-amber-600 font-semibold">Peak</span>
                        )}
                      </span>
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-full rounded-full flex items-center pl-2 transition-all duration-500 ${
                            isTop ? 'bg-indigo-600' : 'bg-indigo-400'
                          }`}
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-32 text-right tabular-nums">
                        {formatKES(d.avgRevenueCents)}
                      </span>
                      <span className="text-xs text-gray-400 w-16 text-right tabular-nums">
                        {d.avgSales.toFixed(1)} sales
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Navigate to demand tab */}
            <div className="flex justify-center">
              <button
                onClick={() => setTab('demand')}
                className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
              >
                View full demand forecast <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
