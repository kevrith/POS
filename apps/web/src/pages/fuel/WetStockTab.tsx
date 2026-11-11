import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Card, EmptyState, Input } from '../../components/ui';
import { litres } from './money';
import { useFuelScope } from './useFuelData';

interface Row {
  tankId: string; label: string; gradeName: string; bookLitres: number; capacityLitres: number; belowMinimum: boolean;
  soldLitres: number; deliveredLitres: number; shortDeliveryLitres: number; dipCount: number;
  varianceLitres: number; variancePct: number; status: 'OK' | 'WATCH' | 'ALERT'; lastDipAt: string | null; hoursSinceDip: number | null; dipOverdue: boolean; waterMm: number | null;
}

const TONE = { OK: 'success', WATCH: 'warning', ALERT: 'danger' } as const;
const WORD = { OK: 'Within limits', WATCH: 'Watch', ALERT: 'Investigate' } as const;

export default function WetStockTab() {
  const { businessId, storeId } = useFuelScope();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data = [], isPending: isLoading } = useQuery({
    queryKey: ['fuel-variance', businessId, storeId, from, to],
    queryFn: () => api.get<Row[]>(`/fuel-pump/variance?businessId=${businessId}&storeId=${storeId}${from ? `&startDate=${from}` : ''}${to ? `&endDate=${to}` : ''}`),
    enabled: !!storeId,
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 flex gap-3 items-start text-sm text-gray-700">
        <Info className="w-5 h-5 text-brand-700 flex-shrink-0 mt-0.5" aria-hidden />
        <p>Each time a tank is measured, the system compares what was found with what the books said it should hold. The difference is fuel lost or gained to evaporation, leaks, theft or a mis-set meter. It is judged against how much was sold from that tank: past half a percent needs looking into. Measure every tank daily.</p>
      </Card>

      <div className="flex flex-wrap gap-3 items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading ? <p className="text-sm text-gray-500 py-8 text-center">Loading...</p> : data.length === 0 ? (
        <Card><EmptyState title="No tanks to report on" description="Add tanks under Tanks, then measure them." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Tank</th>
                  <th className="text-right px-3 py-2">Books say now</th>
                  <th className="text-right px-3 py-2">Sold</th>
                  <th className="text-right px-3 py-2">Delivered</th>
                  <th className="text-right px-3 py-2">Short on delivery</th>
                  <th className="text-right px-3 py-2">Gain / loss</th>
                  <th className="text-right px-3 py-2">Of sales</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Last measured</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.tankId} className="border-t">
                    <td className="px-4 py-2"><p className="font-medium">{r.label}</p><p className="text-xs text-gray-600">{r.gradeName}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(r.bookLitres, 0)}{r.belowMinimum && <span className="block text-xs text-red-700">Below reorder level</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(r.soldLitres, 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{litres(r.deliveredLitres, 0)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.shortDeliveryLitres > 0 ? 'text-red-700' : ''}`}>{r.shortDeliveryLitres > 0 ? litres(r.shortDeliveryLitres) : '-'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.varianceLitres < 0 ? 'text-red-700' : ''}`}>{r.dipCount === 0 ? '-' : `${r.varianceLitres > 0 ? '+' : ''}${litres(r.varianceLitres)}`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.dipCount === 0 ? '-' : `${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(2)}%`}</td>
                    <td className="px-3 py-2">{r.dipCount === 0 ? <Badge>No readings</Badge> : <Badge tone={TONE[r.status]}>{WORD[r.status]}</Badge>}</td>
                    <td className="px-3 py-2">
                      {r.lastDipAt ? new Date(r.lastDipAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'}
                      {r.dipOverdue && <span className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="w-3 h-3" aria-hidden />Over a day ago</span>}
                      {r.waterMm !== null && r.waterMm > 0 && <span className="block text-xs text-amber-800">Water {r.waterMm} mm</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
