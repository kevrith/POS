import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Card, Input, Select } from '../../components/ui';
import { useDialog } from '../../components/Dialog';
import { litres } from './money';
import { PAYMENT_LABEL } from './types';
import { useFuelScope, usePumps } from './useFuelData';

interface SaleRow {
  id: string; createdAt: string; litresDispensed: number; pricePerLitreCents: number; totalCents: number; paymentMethod: string;
  vehiclePlate: string | null; status: string; attendantName: string | null; nozzleId: string | null;
  pump?: { pumpNumber: number }; grade?: { name: string };
}

export default function SalesTab() {
  const qc = useQueryClient();
  const { prompt } = useDialog();
  const { businessId, storeId, isManager } = useFuelScope();
  const { data: pumps = [] } = usePumps();
  const [pumpId, setPumpId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['fuel-sales', businessId, storeId, pumpId, from, to],
    queryFn: () => api.get<SaleRow[]>(`/fuel-pump/sales?businessId=${businessId}&storeId=${storeId}${pumpId ? `&pumpId=${pumpId}` : ''}${from ? `&startDate=${from}` : ''}${to ? `&endDate=${to}` : ''}`),
    enabled: !!storeId,
  });

  const voidSale = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/fuel-pump/sales/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Sale voided');
      for (const k of ['fuel-sales', 'fuel-tanks', 'fuel-stats', 'fleet-accounts', 'shift-summary']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-end">
        <Select label="Pump" value={pumpId} onChange={(e) => setPumpId(e.target.value)}>
          <option value="">All pumps</option>
          {pumps.map((p) => <option key={p.id} value={p.id}>Pump {p.pumpNumber}</option>)}
        </Select>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Time</th><th className="text-left px-3 py-2">Pump</th><th className="text-left px-3 py-2">Attendant</th>
                <th className="text-right px-3 py-2">Litres</th><th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Paid by</th><th className="text-left px-3 py-2">Plate</th>{isManager && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className={`border-t ${s.status === 'VOIDED' ? 'text-gray-500' : ''}`}>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{new Date(s.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-2"><span className="font-medium">Pump {s.pump?.pumpNumber}</span> <span className="text-gray-600">{s.grade?.name}</span></td>
                  <td className="px-3 py-2">{s.attendantName ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{litres(s.litresDispensed)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatKES(s.pricePerLitreCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatKES(s.totalCents)}</td>
                  <td className="px-3 py-2"><Badge>{PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}</Badge></td>
                  <td className="px-3 py-2">{s.vehiclePlate ?? '-'}</td>
                  {isManager && (
                    <td className="px-3 py-2 text-right">
                      {s.status === 'VOIDED' ? <Badge tone="danger">Voided</Badge> : (
                        <button type="button" className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-50" disabled={voidSale.isPending}
                          onClick={async () => {
                            const reason = await prompt({ title: 'Void this sale', message: 'The litres go back into the tank and any invoice is cancelled. The litres still show as unrecorded at the shift close, because they did pass the meter.', placeholder: 'Reason', confirmLabel: 'Void sale' });
                            if (reason) voidSale.mutate({ id: s.id, reason });
                          }}>Void</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!isLoading && sales.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No sales found</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {sales.length === 200 && <p className="text-xs text-gray-600">Showing the latest 200. Narrow the dates to see older sales.</p>}
    </div>
  );
}
