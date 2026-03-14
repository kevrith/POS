import { Download, Users, TrendingUp, RefreshCw, DollarSign, BarChart3 } from 'lucide-react';

interface CustomerAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  avgOrderValue: number;
  customerLifetimeValue: number;
  topCustomers: Array<{
    id: string;
    name: string;
    totalSpent: number;
    orderCount: number;
    lastVisit: string;
  }>;
  rfmSegments: Array<{
    segment: string;
    count: number;
    avgSpend: number;
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

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

interface CustomerAnalyticsTabProps {
  customerAnalytics: CustomerAnalytics | undefined;
}

export default function CustomerAnalyticsTab({ customerAnalytics }: CustomerAnalyticsTabProps) {
  if (!customerAnalytics) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading customer analytics…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Customers"
          value={customerAnalytics.totalCustomers}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          label="New Customers"
          value={customerAnalytics.newCustomers}
          icon={TrendingUp}
          color="bg-green-500"
          sub="This period"
        />
        <StatCard
          label="Returning Rate"
          value={`${customerAnalytics.totalCustomers > 0 ? Math.round((customerAnalytics.returningCustomers / customerAnalytics.totalCustomers) * 100) : 0}%`}
          icon={RefreshCw}
          color="bg-purple-500"
        />
        <StatCard
          label="Avg Order Value"
          value={formatKES(customerAnalytics.avgOrderValue)}
          icon={DollarSign}
          color="bg-emerald-500"
        />
        <StatCard
          label="Customer LTV"
          value={formatKES(customerAnalytics.customerLifetimeValue)}
          icon={BarChart3}
          color="bg-orange-500"
        />
      </div>

      {/* RFM Segmentation */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Customer Segmentation (RFM Analysis)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {customerAnalytics.rfmSegments.map((segment, i) => (
            <div key={segment.segment} className="text-center p-4 rounded-lg border border-gray-100">
              <div
                className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              >
                {segment.count}
              </div>
              <h3 className="font-semibold text-sm text-gray-800">{segment.segment}</h3>
              <p className="text-xs text-gray-500 mt-1">
                Avg: {formatKES(segment.avgSpend)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Top Customers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b flex justify-between items-center">
          <h2 className="font-semibold text-gray-800">Top Customers by Value</h2>
          <button
            onClick={() => {
              const rows = customerAnalytics.topCustomers.map((c) => [
                c.name,
                String(c.orderCount),
                (c.totalSpent / 100).toFixed(2),
                new Date(c.lastVisit).toLocaleDateString('en-KE'),
              ]);
              downloadCsv('top-customers.csv', [
                ['Customer Name', 'Orders', 'Total Spent (KES)', 'Last Visit'],
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
                <th className="text-left px-5 py-3 font-medium text-gray-600">Customer</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Orders</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Total Spent</th>
                <th className="text-right px-5 py-3 font-medium text-gray-600">Avg Order</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Last Visit</th>
                <th className="text-center px-5 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customerAnalytics.topCustomers.map((customer, i) => {
                const avgOrder = customer.orderCount > 0 ? customer.totalSpent / customer.orderCount : 0;
                const daysSinceVisit = Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / (1000 * 60 * 60 * 24));
                const status = daysSinceVisit <= 7 ? 'Active' : daysSinceVisit <= 30 ? 'Recent' : 'At Risk';
                const statusColor = status === 'Active' ? 'bg-green-100 text-green-700' : status === 'Recent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                
                return (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-700">
                          {i + 1}
                        </div>
                        <span className="font-medium">{customer.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center">{customer.orderCount}</td>
                    <td className="px-5 py-3 text-right font-semibold">{formatKES(customer.totalSpent)}</td>
                    <td className="px-5 py-3 text-right">{formatKES(avgOrder)}</td>
                    <td className="px-5 py-3 text-center text-gray-500">
                      {new Date(customer.lastVisit).toLocaleDateString('en-KE')}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>
                        {status}
                      </span>
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