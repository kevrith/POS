import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, StickyNote } from 'lucide-react';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';

interface ClientHistory {
  customer: { id: string; name: string; phone?: string | null; notes?: string | null; loyaltyPoints: number };
  counts: { completed: number; noShow: number; cancelled: number; upcoming: number };
  spentCents: number;
  visits: Array<{ id: string; scheduledAt: string; status: string; notes?: string | null; services: string[]; totalCents: number | null; receiptNumber: string | null }>;
}

const STATUS_LABEL: Record<string, string> = { COMPLETED: 'Done', NO_SHOW: 'No-show', CANCELLED: 'Cancelled', BOOKED: 'Booked', CONFIRMED: 'Confirmed', IN_PROGRESS: 'In progress' };

/** A client's notes, how reliable they are, and their recent visits. The notes are for the staff (allergies, colour formula). */
export default function ClientPanel({ customerId, compact = false }: { customerId: string; compact?: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<ClientHistory>({
    queryKey: ['client-history', customerId],
    queryFn: () => api.get<ClientHistory>(`/appointments/clients/${customerId}`),
    staleTime: 30_000,
  });
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(data?.customer.notes ?? ''), [data?.customer.notes]);

  const save = useMutation({
    mutationFn: () => api.patch(`/appointments/clients/${customerId}/notes`, { notes }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['client-history', customerId] }); toast.success('Notes saved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" /></div>;
  if (error || !data) return <p className="text-xs text-red-600 py-2">{error instanceof Error ? error.message : 'Could not load this client.'}</p>;

  const { counts } = data;
  const unreliable = counts.noShow >= 2;
  return (
    <div className="space-y-2.5 rounded-xl border bg-gray-50 dark:bg-gray-800/60 dark:border-gray-700 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">{counts.completed} visit{counts.completed === 1 ? '' : 's'}</span>
        {counts.noShow > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 font-semibold text-red-700">{counts.noShow} no-show{counts.noShow === 1 ? '' : 's'}</span>}
        {counts.cancelled > 0 && <span className="rounded-full bg-gray-200 px-2 py-0.5 font-semibold text-gray-600">{counts.cancelled} cancelled</span>}
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">{formatKES(data.spentCents)} spent</span>
        {data.customer.loyaltyPoints > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{data.customer.loyaltyPoints} points</span>}
      </div>
      {unreliable && (
        <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> Has missed {counts.noShow} appointments. Consider asking for a deposit.
        </p>
      )}
      <div>
        <label htmlFor={`notes-${customerId}`} className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300"><StickyNote className="h-3.5 w-3.5" /> Notes about this client</label>
        <textarea
          id={`notes-${customerId}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={compact ? 2 : 3} maxLength={1000}
          placeholder="Allergies, colour formula, preferences"
          className="w-full rounded-lg border px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
        {notes !== (data.customer.notes ?? '') && (
          <button onClick={() => save.mutate()} disabled={save.isPending} className="mt-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {save.isPending ? 'Saving...' : 'Save notes'}
          </button>
        )}
      </div>
      {!compact && data.visits.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">Recent visits</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {data.visits.slice(0, 8).map((v) => (
              <li key={v.id} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">
                  {new Date(v.scheduledAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                  {v.services.length > 0 ? ` - ${v.services.join(', ')}` : ''}
                </span>
                <span className="flex-shrink-0 text-gray-500">{STATUS_LABEL[v.status] ?? v.status}{v.totalCents != null ? ` - ${formatKES(v.totalCents)}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
