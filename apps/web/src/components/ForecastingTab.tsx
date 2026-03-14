import { Download, Package, AlertCircle, TrendingUp, ShoppingBag, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Area, Line
} from 'recharts';

interface ForecastData {
  items: Array<{
    itemId: string;
    itemName: string;
    currentStock: number;
    forecastedDemand: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    trend: number;
    seasonality: number;
    reorderPoint: number;
    suggestedOrderQty: number;
  }>;
  demandPatterns: Array<{
    date: string;
    predicted: number;
    actual?: number;
    confidence: number;
  }>;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  sub?: string;
}

function StatCard({ label, value, icon: Icon, color, sub }: StatCardProps) {
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

interface ForecastingTabProps {
  forecastData: ForecastData | undefined;
}

export default function ForecastingTab({ forecastData }: ForecastingTabProps) {
  if (!forecastData) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading forecasting data…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Forecast Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Items Tracked"
          value={forecastData.items.length}
          icon={Package}
          color="bg-blue-500"
        />
        <StatCard
          label="Low Stock Items"
          value={forecastData.items.filter(i => i.currentStock < i.reorderPoint).length}
          icon={AlertCircle}
          color="bg-red-500"
        />
        <StatCard
          label="High Confidence"
          value={forecastData.items.filter(i => i.confidence === 'HIGH').length}
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          label="Reorder Needed"
          value={forecastData.items.filter(i => i.suggestedOrderQty > 0).length}
          icon={ShoppingBag}
          color="bg-orange-500"
        />
      </div>

      {/* Demand Forecast Chart */}
      {forecastData.demandPatterns.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Demand Forecast vs Actual</h2>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={forecastData.demandPatterns}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="predicted" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} name="Predicted" />
              <Line type="monotone" dataKey="actual" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} name="Actual" />
              <Line type="monotone" dataKey="confidence" stroke="#10B981" strokeWidth={1} strokeDasharray="5 5" name="Confidence" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Forecast Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-gray-800">Inventory Forecast & Recommendations</h2>
          <button
            onClick={() => {
              const rows = forecastData.items.map((item) => [
                item.itemName,
                String(item.currentStock),
                String(item.forecastedDemand),
                String(item.reorderPoint),
                String(item.suggestedOrderQty),
                item.confidence,
                item.trend.toFixed(3),
              ]);
              downloadCsv('inventory-forecast.csv', [
                ['Item', 'Current Stock', 'Forecasted Demand', 'Reorder Point', 'Suggested Order', 'Confidence', 'Trend'],
                ...rows,
              ]);
            }}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Item</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Current Stock</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Forecasted Demand</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Reorder Point</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Suggested Order</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Confidence</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {forecastData.items
                .sort((a, b) => b.suggestedOrderQty - a.suggestedOrderQty)
                .map((item) => {
                  const needsReorder = item.currentStock < item.reorderPoint;
                  const trendDirection = item.trend > 0.1 ? 'up' : item.trend < -0.1 ? 'down' : 'stable';
                  const trendColor = trendDirection === 'up' ? 'text-green-600' : trendDirection === 'down' ? 'text-red-600' : 'text-gray-600';
                  
                  return (
                    <tr key={item.itemId} className={`hover:bg-gray-50 ${needsReorder ? 'bg-red-50/30' : ''}`}>
                      <td className="px-5 py-3 font-medium">{item.itemName}</td>
                      <td className={`px-5 py-3 text-center ${needsReorder ? 'text-red-600 font-semibold' : ''}`}>
                        {item.currentStock}
                      </td>
                      <td className="px-5 py-3 text-center">{item.forecastedDemand}</td>
                      <td className="px-5 py-3 text-center text-orange-600">{item.reorderPoint}</td>
                      <td className="px-5 py-3 text-center">
                        {item.suggestedOrderQty > 0 ? (
                          <span className="font-semibold text-blue-600">{item.suggestedOrderQty}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          item.confidence === 'HIGH' ? 'bg-green-100 text-green-700' :
                          item.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {item.confidence}
                        </span>
                      </td>
                      <td className={`px-5 py-3 text-center font-semibold ${trendColor}`}>
                        {trendDirection === 'up' ? '↗' : trendDirection === 'down' ? '↘' : '→'}
                        {Math.abs(item.trend * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}