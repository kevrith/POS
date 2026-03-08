import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const formatKES = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

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

export default function ForecastingPage() {
  const user = useAuthStore(s => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const [tab, setTab] = useState<Tab>('demand');
  const [days, setDays] = useState(30);
  const [period, setPeriod] = useState('7d');
  const [loading, setLoading] = useState(false);

  const [forecastData, setForecastData] = useState<ForecastItem[]>([]);
  const [fastMovers, setFastMovers] = useState<TopMover[]>([]);
  const [slowMovers, setSlowMovers] = useState<TopMover[]>([]);
  const [hourly, setHourly] = useState<HourlyPattern[]>([]);
  const [daily, setDaily] = useState<DailyPattern[]>([]);

  const loadDemand = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ businessId, days: String(days) });
      if (storeId) params.set('storeId', storeId);
      const data = await api.get<{ items: ForecastItem[] } | ForecastItem[]>(`/forecasting/demand?${params}`);
      // Handle both response formats: { items: [] } or []
      const items = Array.isArray(data) ? data : (data.items || []);
      setForecastData(items);
    } catch (e) { 
      console.error('Forecast error:', e); 
      setForecastData([]);
    }
    setLoading(false);
  };

  const loadMovers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ businessId, period });
      if (storeId) params.set('storeId', storeId);
      const data = await api.get<{ fastMovers: TopMover[]; slowMovers: TopMover[] }>(`/forecasting/top-movers?${params}`);
      setFastMovers(data.fastMovers || []);
      setSlowMovers(data.slowMovers || []);
    } catch (e) { 
      console.error('Movers error:', e); 
      setFastMovers([]);
      setSlowMovers([]);
    }
    setLoading(false);
  };

  const loadSeasonal = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ businessId });
      if (storeId) params.set('storeId', storeId);
      const data = await api.get<{ hourly: HourlyPattern[]; daily: DailyPattern[] }>(`/forecasting/seasonal?${params}`);
      setHourly(data.hourly || []);
      setDaily(data.daily || []);
    } catch (e) { 
      console.error('Seasonal error:', e); 
      setHourly([]);
      setDaily([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (tab === 'demand') loadDemand();
    else if (tab === 'movers') loadMovers();
    else loadSeasonal();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, days, period]);

  const exportCSV = () => {
    const rows = [
      ['Item', 'Current Stock', 'Weekly Avg Sales', 'Trend', `Forecast (${days}d)`, 'Status', 'Suggested Order'],
      ...forecastData.map(i => [
        i.itemName,
        String(i.currentStock),
        String(i.weeklyAvgSales),
        i.trend > 0.05 ? 'UP' : i.trend < -0.05 ? 'DOWN' : 'FLAT',
        String(i.forecastedDemand),
        i.isLowStock ? 'LOW_STOCK' : 'ADEQUATE',
        String(i.suggestedOrderQty),
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demand-forecast-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trendIcon = (trend: number) =>
    trend > 0.05 ? '↑' : trend < -0.05 ? '↓' : '→';

  const maxHourlyRevenue = Math.max(...hourly.map(h => h.avgRevenueCents), 1);
  const maxDailyRevenue = Math.max(...daily.map(d => d.avgRevenueCents), 1);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Demand Forecasting</h1>
        <button
          onClick={() => { if (tab === 'demand') loadDemand(); else if (tab === 'movers') loadMovers(); else loadSeasonal(); }}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {(['demand', 'movers', 'seasonal'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === t
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {t === 'demand' ? 'Demand Forecast' : t === 'movers' ? 'Top/Slow Movers' : 'Seasonal Patterns'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
        </div>
      )}

      {/* Demand Forecast Tab */}
      {!loading && tab === 'demand' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">Forecast period:</span>
            {[7, 14, 30, 60].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1 rounded-full text-sm ${
                  days === d
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {d}d
              </button>
            ))}
            <button onClick={exportCSV} className="ml-auto px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-xl shadow">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {['Item', 'Current Stock', 'Weekly Avg', 'Trend', `Forecast (${days}d)`, 'Status', 'Order Qty', 'Confidence'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {forecastData.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No sales data for forecasting. Make some sales first.</td></tr>
                )}
                {forecastData.map(item => (
                  <tr key={item.itemId} className={item.isLowStock ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.itemName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.currentStock}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.weeklyAvgSales.toFixed(1)}</td>
                    <td className="px-4 py-3 text-lg">
                      <span className={item.trend > 0.05 ? 'text-green-600' : item.trend < -0.05 ? 'text-red-600' : 'text-gray-400'}>
                        {trendIcon(item.trend)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{item.forecastedDemand}</td>
                    <td className="px-4 py-3">
                      {item.isLowStock ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">LOW STOCK</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">ADEQUATE</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-indigo-700 dark:text-indigo-400">
                      {item.suggestedOrderQty > 0 ? item.suggestedOrderQty : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
                        item.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {item.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Movers Tab */}
      {!loading && tab === 'movers' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">Period:</span>
            {[['7d', '7 days'], ['14d', '14 days'], ['30d', '30 days']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPeriod(val)}
                className={`px-3 py-1 rounded-full text-sm ${
                  period === val
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">🚀 Fast Movers</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase">
                    <th className="text-left pb-2">Item</th>
                    <th className="text-right pb-2">Qty</th>
                    <th className="text-right pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {fastMovers.map((m, i) => (
                    <tr key={m.itemId}>
                      <td className="py-2">
                        <span className="text-xs text-gray-400 mr-2">#{i + 1}</span>
                        {m.itemName}
                      </td>
                      <td className="py-2 text-right font-medium">{m.totalQty}</td>
                      <td className="py-2 text-right text-green-600">{formatKES(m.totalRevenueCents)}</td>
                    </tr>
                  ))}
                  {fastMovers.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-xs">No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">🐌 Slow Movers</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase">
                    <th className="text-left pb-2">Item</th>
                    <th className="text-right pb-2">Qty</th>
                    <th className="text-right pb-2">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {slowMovers.map((m) => (
                    <tr key={m.itemId}>
                      <td className="py-2">{m.itemName}</td>
                      <td className="py-2 text-right text-red-500">{m.totalQty}</td>
                      <td className="py-2 text-right text-gray-500">{formatKES(m.totalRevenueCents)}</td>
                    </tr>
                  ))}
                  {slowMovers.length === 0 && (
                    <tr><td colSpan={3} className="py-4 text-center text-gray-400 text-xs">No data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Seasonal Tab */}
      {!loading && tab === 'seasonal' && (
        <div className="space-y-6">
          {/* Hourly heat map */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Hourly Sales Pattern (last 30 days avg)</h3>
            <div className="flex gap-1 flex-wrap">
              {hourly.map(h => {
                const intensity = maxHourlyRevenue > 0 ? h.avgRevenueCents / maxHourlyRevenue : 0;
                const bg = `rgba(99,102,241,${Math.max(0.08, intensity)})`;
                return (
                  <div
                    key={h.hour}
                    title={`${h.hour}:00 — Avg ${h.avgSales.toFixed(1)} sales, ${formatKES(h.avgRevenueCents)}`}
                    className="flex flex-col items-center rounded p-2 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-all"
                    style={{ background: bg, minWidth: 44 }}
                  >
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{h.hour}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{h.avgSales.toFixed(0)}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">Each cell = hour of day (0–23). Darker = higher revenue. Hover for details.</p>
          </div>

          {/* Daily bar chart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Day of Week Pattern</h3>
            {daily.length === 0 && <p className="text-gray-400 text-sm">No data yet.</p>}
            <div className="space-y-3">
              {daily.map(d => {
                const pct = maxDailyRevenue > 0 ? (d.avgRevenueCents / maxDailyRevenue) * 100 : 0;
                return (
                  <div key={d.dayOfWeek} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 dark:text-gray-300 w-24 shrink-0">{d.dayName}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full flex items-center pl-2 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-28 text-right">
                      {formatKES(d.avgRevenueCents)}
                    </span>
                    <span className="text-xs text-gray-400 w-16 text-right">{d.avgSales.toFixed(1)} sales</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
