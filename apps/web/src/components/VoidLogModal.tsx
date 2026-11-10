import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { voidReason } from '@pos/shared';
import { api } from '../lib/api';

interface VoidRow {
  id: string;
  createdAt: string;
  scope: 'ITEM' | 'ORDER';
  itemName: string;
  quantity: number;
  valueCents: number;
  reasonCode: string;
  note: string | null;
  wasSent: boolean;
  wasPrepared: boolean;
  voidedByName: string;
  approvedById: string | null;
  approvedByName: string | null;
  voidedById: string;
}

const fmt = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const RANGES = [{ label: 'Today', days: 0 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }] as const;

/** A manager's review of everything taken off table orders: who, what, how much, why, and who approved. */
export default function VoidLogModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const [days, setDays] = useState<number>(7);
  const from = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  const { data: rows = [], isLoading, error } = useQuery<VoidRow[]>({
    queryKey: ['void-log', storeId, from],
    queryFn: () => api.get<VoidRow[]>(`/hospitality/voids?storeId=${storeId}&from=${encodeURIComponent(from)}`),
    enabled: !!storeId,
  });

  const total = rows.reduce((s, r) => s + r.valueCents, 0);
  const wasted = rows.filter((r) => r.wasPrepared || voidReason(r.reasonCode)?.waste).reduce((s, r) => s + r.valueCents, 0);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Void log" className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Void log</h2>
            <p className="text-xs text-gray-500">Every item or order taken off a table, kept permanently.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {RANGES.map((r) => (
                <button key={r.label} onClick={() => setDays(r.days)}
                  className={`rounded-md px-3 py-1 text-sm font-medium ${days === r.days ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 border-b bg-gray-50 px-5 py-3 text-sm">
          <div><p className="text-xs text-gray-500">Voids</p><p className="text-lg font-bold">{rows.length}</p></div>
          <div><p className="text-xs text-gray-500">Value taken off</p><p className="text-lg font-bold">{fmt(total)}</p></div>
          <div><p className="text-xs text-gray-500">Food wasted (made, then voided)</p><p className="text-lg font-bold text-red-700">{fmt(wasted)}</p></div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
          ) : error ? (
            <p className="px-5 py-10 text-center text-sm text-red-600">{error instanceof Error ? error.message : 'Could not load the void log'}</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-gray-500">No voids in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b">
                  <th className="px-4 py-2">When</th><th className="px-2 py-2">Item</th><th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Value</th><th className="px-2 py-2">Reason</th><th className="px-2 py-2">By</th><th className="px-4 py-2">Approved by</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-600">{new Date(r.createdAt).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-2 py-2 font-medium text-gray-900">
                      {r.itemName}
                      {r.scope === 'ORDER' && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">whole order</span>}
                      {r.wasPrepared && <span className="ml-1.5 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">made</span>}
                      {r.wasSent && !r.wasPrepared && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">sent</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.quantity}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmt(r.valueCents)}</td>
                    <td className="px-2 py-2 text-gray-700">{voidReason(r.reasonCode)?.label ?? r.reasonCode}{r.note ? <span className="block text-xs text-gray-500">{r.note}</span> : null}</td>
                    <td className="px-2 py-2 text-gray-700">{r.voidedByName}</td>
                    <td className="px-4 py-2 text-gray-700">{r.approvedByName ? (r.approvedById === r.voidedById ? 'Self' : r.approvedByName) : <span className="text-gray-400">not needed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
