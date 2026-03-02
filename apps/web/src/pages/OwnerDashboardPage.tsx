import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  LayoutDashboard, TrendingUp, ShoppingCart, Package,
  Store,
} from 'lucide-react';
import { formatKES } from '@pos/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StoreStats {
  storeId: string;
  storeName: string;
  storeCode: string;
  totalRevenueCents: number;
  totalVatCents: number;
  transactionCount: number;
  topItems: Array<{ itemId: string; name: string; qtySold: number; revenueCents: number }>;
  totalStockLines: number;
}

interface CrossStoreSummary {
  stores: StoreStats[];
  summary: {
    totalRevenueCents: number;
    totalTransactions: number;
    storeCount: number;
  };
}

// ─── Date Presets ─────────────────────────────────────────────────────────────

const PRESETS = [
  { label: 'Today',      days: 0  },
  { label: 'Last 7 days', days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'This month',  days: -1 }, // special
];

function getRange(days: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (days === -1) {
    // This month
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (days === 0) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  const start = new Date(end.getTime() - days * 86400000);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ─── Store Card ───────────────────────────────────────────────────────────────

function StoreCard({
  store,
  rank,
  totalRevenue,
}: {
  store: StoreStats;
  rank: number;
  totalRevenue: number;
}) {
  const share = totalRevenue > 0 ? (store.totalRevenueCents / totalRevenue) * 100 : 0;
  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Store className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{store.storeName}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{store.storeCode}</span>
          </div>
        </div>
        <span className={`text-lg font-bold ${rankColors[rank] ?? 'text-gray-500'}`}>
          #{rank + 1}
        </span>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Revenue</p>
          <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
            {formatKES(store.totalRevenueCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Transactions</p>
          <p className="text-base font-bold text-gray-900 dark:text-white mt-0.5">
            {store.transactionCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">VAT Collected</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
            {formatKES(store.totalVatCents)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Stock Lines</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-0.5">
            {store.totalStockLines}
          </p>
        </div>
      </div>

      {/* Revenue share bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Revenue share</span>
          <span className="font-medium">{share.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${share}%` }}
          />
        </div>
      </div>

      {/* Top items */}
      {store.topItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Top Items</p>
          <div className="space-y-1.5">
            {store.topItems.slice(0, 3).map((item) => (
              <div key={item.itemId} className="flex items-center justify-between">
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[60%]">{item.name}</span>
                <span className="text-xs font-medium text-gray-900 dark:text-white">
                  {formatKES(item.revenueCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OwnerDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const [preset, setPreset] = useState(1); // default: last 7 days

  const { start, end } = getRange(PRESETS[preset].days);

  const { data, isLoading } = useQuery<CrossStoreSummary>({
    queryKey: ['cross-store-dashboard', businessId, start, end],
    queryFn: () =>
      api.get(`/reports/cross-store-dashboard?businessId=${businessId}&startDate=${start}&endDate=${end}`),
    enabled: !!businessId,
  });

  const stores = data?.stores ?? [];
  const summary = data?.summary;

  // Sort stores by revenue descending
  const ranked = [...stores].sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-blue-600" />
            Owner Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Aggregate view across all stores</p>
        </div>
        {/* Date preset */}
        <div className="flex gap-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
          {PRESETS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPreset(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                preset === i
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Business-wide summary */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              {
                label: 'Total Revenue',
                value: formatKES(summary?.totalRevenueCents ?? 0),
                icon: TrendingUp,
                color: 'text-green-600',
                bg: 'bg-green-50 dark:bg-green-900/20',
              },
              {
                label: 'Total Transactions',
                value: (summary?.totalTransactions ?? 0).toLocaleString(),
                icon: ShoppingCart,
                color: 'text-blue-600',
                bg: 'bg-blue-50 dark:bg-blue-900/20',
              },
              {
                label: 'Active Stores',
                value: (summary?.storeCount ?? 0).toString(),
                icon: Store,
                color: 'text-purple-600',
                bg: 'bg-purple-50 dark:bg-purple-900/20',
              },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`${bg} rounded-xl p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</p>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Per-store cards */}
          {ranked.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No data for the selected period.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ranked.map((store, idx) => (
                <StoreCard
                  key={store.storeId}
                  store={store}
                  rank={idx}
                  totalRevenue={summary?.totalRevenueCents ?? 0}
                />
              ))}
            </div>
          )}

          {/* Revenue comparison bar chart */}
          {ranked.length > 1 && (
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                Revenue Comparison
              </h3>
              <div className="space-y-3">
                {ranked.map((store) => {
                  const share = summary?.totalRevenueCents
                    ? (store.totalRevenueCents / summary.totalRevenueCents) * 100
                    : 0;
                  return (
                    <div key={store.storeId}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{store.storeName}</span>
                        <span className="text-gray-900 dark:text-white font-semibold">{formatKES(store.totalRevenueCents)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-700"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
