import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Card, Input, StatTile } from '../../components/ui';
import { litres } from './money';
import { PAYMENT_LABEL } from './types';
import { useFuelScope } from './useFuelData';

interface Stats {
  totalRevenueCents: number; totalLitres: number; totalTransactions: number;
  marginCents: number; costedRevenueCents: number; uncostedRevenueCents: number;
  byGrade: Array<{ gradeId: string; gradeName: string; revenueCents: number; litres: number; transactions: number; marginCents: number; costedRevenueCents: number }>;
  byPayment: Array<{ method: string; revenueCents: number; litres: number; transactions: number }>;
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

export default function ReportsTab() {
  const { businessId, storeId } = useFuelScope();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const { data, isPending: isLoading } = useQuery({
    queryKey: ['fuel-stats', businessId, storeId, from, to],
    queryFn: () => api.get<Stats>(`/fuel-pump/stats?businessId=${businessId}&storeId=${storeId}${from ? `&startDate=${from}` : ''}${to ? `&endDate=${to}` : ''}`),
    enabled: !!storeId,
  });
  const marginPct = data && data.costedRevenueCents > 0 ? (data.marginCents / data.costedRevenueCents) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {isLoading || !data ? <p className="text-sm text-gray-500 py-8 text-center">Loading...</p> : (
        <>
          <div className="grid grid-cols-1 min-[500px]:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Fuel sales" value={formatKES(data.totalRevenueCents)} note={`${data.totalTransactions} transaction${data.totalTransactions === 1 ? '' : 's'}`} />
            <StatTile label="Litres sold" value={litres(data.totalLitres, 0)} />
            <StatTile label="Gross margin" value={data.costedRevenueCents > 0 ? formatKES(data.marginCents) : 'no costs yet'} tone={data.marginCents < 0 ? 'danger' : 'neutral'} note={marginPct === null ? 'Enter the cost on deliveries' : `${marginPct.toFixed(1)}% of costed sales`} />
            <StatTile label="Average pump price" value={data.totalLitres > 0 ? formatKES(Math.round(data.totalRevenueCents / data.totalLitres)) : '-'} note="Sales divided by litres" />
          </div>
          {data.uncostedRevenueCents > 0 && (
            <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-4 py-2">{formatKES(data.uncostedRevenueCents)} of these sales is fuel whose cost was not known, so it is left out of the margin. Enter the cost per litre when you record a delivery.</p>
          )}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b"><h3 className="font-semibold text-gray-900">By grade</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide"><tr><th className="text-left px-4 py-2">Grade</th><th className="text-right px-3 py-2">Litres</th><th className="text-right px-3 py-2">Sales</th><th className="text-right px-3 py-2">Margin</th></tr></thead>
                <tbody>
                  {data.byGrade.map((g) => (
                    <tr key={g.gradeId} className="border-t"><td className="px-4 py-2 font-medium">{g.gradeName}</td><td className="px-3 py-2 text-right tabular-nums">{litres(g.litres, 0)}</td><td className="px-3 py-2 text-right tabular-nums">{formatKES(g.revenueCents)}</td><td className="px-3 py-2 text-right tabular-nums">{g.costedRevenueCents > 0 ? formatKES(g.marginCents) : '-'}</td></tr>
                  ))}
                  {data.byGrade.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No sales in this period</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b"><h3 className="font-semibold text-gray-900">By payment method</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide"><tr><th className="text-left px-4 py-2">Paid by</th><th className="text-right px-3 py-2">Sales</th><th className="text-right px-3 py-2">Litres</th><th className="text-right px-3 py-2">Transactions</th></tr></thead>
                <tbody>
                  {data.byPayment.map((p) => (
                    <tr key={p.method} className="border-t"><td className="px-4 py-2 font-medium">{PAYMENT_LABEL[p.method] ?? p.method}</td><td className="px-3 py-2 text-right tabular-nums">{formatKES(p.revenueCents)}</td><td className="px-3 py-2 text-right tabular-nums">{litres(p.litres, 0)}</td><td className="px-3 py-2 text-right tabular-nums">{p.transactions}</td></tr>
                  ))}
                  {data.byPayment.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">No sales in this period</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
