import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { nairobiDay } from '../../lib/nairobiDay';
import { clock, nairobiMinuteOfDay, visitMinutes, visitPriceCents, type Stylist } from '../../lib/salon';
import ClientPanel from './ClientPanel';

export interface CatalogueItem {
  id: string;
  name: string;
  type?: string;
  retailPriceCents: number;
  durationMinutes?: number | null;
  trackStock?: boolean;
}

interface Client { id: string; name: string; phone?: string | null }
interface Row { key: number; itemId: string; staffId: string; durationMin: number }

const PAY_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;
let rowKey = 0;
const newRow = (): Row => ({ key: ++rowKey, itemId: '', staffId: '', durationMin: 30 });

/**
 * Book an appointment: pick (or add) the client, then one or more services, each with its own stylist. A service fills in
 * its own duration and price; the visit's length is the sum, and the end time is shown.
 */
export default function BookingModal({
  businessId, storeId, services, stylists, onPipeline, defaultDay, onClose, onBooked,
}: {
  businessId: string;
  storeId?: string;
  services: CatalogueItem[];
  stylists: Stylist[];
  onPipeline: boolean;
  defaultDay: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const [client, setClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [when, setWhen] = useState(`${defaultDay >= nairobiDay() ? defaultDay : nairobiDay()}T09:00`);
  const [deposit, setDeposit] = useState(0);
  const [depositMethod, setDepositMethod] = useState('CASH');
  const [notes, setNotes] = useState('');

  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 250); return () => clearTimeout(t); }, [search]);
  const { data: matches = [] } = useQuery<Client[]>({
    queryKey: ['client-search', businessId, debounced],
    queryFn: () => api.get<Client[]>(`/businesses/${businessId}/customers?search=${encodeURIComponent(debounced)}`),
    enabled: !!businessId && debounced.length >= 2 && !client,
    staleTime: 15_000,
  });

  const active = stylists.filter((s) => s.active);
  const byId = useMemo(() => new Map(services.map((i) => [i.id, i])), [services]);
  const chosen = rows.filter((r) => r.itemId).map((r) => ({ ...r, item: byId.get(r.itemId)! }));
  const totalMin = visitMinutes(chosen.map((r) => ({ durationMin: r.durationMin })));
  const totalCents = visitPriceCents(chosen.map((r) => ({ unitPriceCents: r.item.retailPriceCents })));
  const startMin = /T(\d\d):(\d\d)$/.test(when) ? Number(when.slice(-5, -3)) * 60 + Number(when.slice(-2)) : nairobiMinuteOfDay(new Date());
  const patch = (key: number, p: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const pickService = (key: number, itemId: string) => patch(key, { itemId, durationMin: byId.get(itemId)?.durationMinutes ?? 30 });

  const book = useMutation({
    mutationFn: async () => {
      let customerId = client?.id;
      // A new client is saved as a real client, so the next visit has a history.
      if (!customerId && name.trim()) {
        const made = await api.post<Client>(`/businesses/${businessId}/customers`, { name: name.trim(), phone: phone.trim() || undefined });
        customerId = made.id;
      }
      return api.post('/appointments', {
        businessId, storeId,
        customerId,
        customerName: client?.name ?? name.trim(),
        customerPhone: client?.phone ?? (phone.trim() || undefined),
        scheduledAt: new Date(when).toISOString(),
        services: chosen.map((r) => ({ itemId: r.itemId, staffId: r.staffId || undefined, durationMin: r.durationMin })),
        notes: notes.trim() || undefined,
        depositCents: deposit,
        depositMethod: onPipeline && deposit > 0 ? depositMethod : undefined,
      });
    },
    onSuccess: () => { toast.success('Appointment booked'); onBooked(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = 'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400';
  const field = 'w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const canBook = (!!client || name.trim().length > 0) && chosen.length > 0 && !!when && !book.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="New appointment" className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-center justify-between border-b p-5 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">New appointment</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Client */}
          <section aria-label="Client" className="space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Client</p>
            {client ? (
              <>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm dark:border-gray-600">
                  <span><strong>{client.name}</strong>{client.phone ? <span className="ml-2 text-gray-500">{client.phone}</span> : null}</span>
                  <button onClick={() => { setClient(null); setSearch(''); }} className="text-xs font-medium text-blue-700 hover:underline">Change</button>
                </div>
                <ClientPanel customerId={client.id} compact />
              </>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an existing client by name or phone" aria-label="Find a client" className={`${field} pl-9`} />
                </div>
                {matches.length > 0 && (
                  <ul className="max-h-36 overflow-y-auto rounded-lg border dark:border-gray-600">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button onClick={() => setClient(m)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-gray-700">
                          <span className="font-medium">{m.name}</span><span className="text-gray-500">{m.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500">Or a new client:</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" aria-label="New client name" className={field} />
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone, 0712 345 678" aria-label="New client phone" className={field} />
                </div>
              </>
            )}
          </section>

          {/* Services */}
          <section aria-label="Services" className="space-y-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Services, one after another</p>
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-12 items-center gap-2">
                <select value={r.itemId} onChange={(e) => pickService(r.key, e.target.value)} aria-label={`Service ${i + 1}`} className={`${field} col-span-5`}>
                  <option value="">Choose a service</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} - {formatKES(s.retailPriceCents)}</option>)}
                </select>
                <select value={r.staffId} onChange={(e) => patch(r.key, { staffId: e.target.value })} aria-label={`Stylist for service ${i + 1}`} className={`${field} col-span-4`}>
                  <option value="">Any stylist</option>
                  {active.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
                </select>
                <div className="col-span-2 flex items-center gap-1">
                  <input type="number" min={5} max={720} step={5} value={r.durationMin} onChange={(e) => patch(r.key, { durationMin: Math.max(5, Number(e.target.value) || 5) })} aria-label={`Minutes for service ${i + 1}`} className={`${field} px-2`} />
                  <span className="text-xs text-gray-500">min</span>
                </div>
                <button onClick={() => setRows((all) => (all.length > 1 ? all.filter((x) => x.key !== r.key) : [newRow()]))} aria-label={`Remove service ${i + 1}`} className="col-span-1 rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setRows((all) => [...all, newRow()])} disabled={rows.length >= 10} className="flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"><Plus className="h-4 w-4" /> Add another service</button>
            {active.length === 0 && <p className="text-xs text-amber-700">No stylists are set up yet. A manager can add them under Team. Until then any staff member can be chosen by leaving this on "Any stylist".</p>}
          </section>

          <section aria-label="When" className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="appt-when" className={label}>Date and time *</label>
              <input id="appt-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} />
            </div>
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-gray-700 dark:text-blue-100">
              {chosen.length === 0 ? 'Choose a service to see the length and price.' : (
                <>
                  <p><strong>{totalMin} min</strong>, ends about <strong>{clock(startMin + totalMin)}</strong></p>
                  <p>{formatKES(totalCents)}</p>
                </>
              )}
            </div>
            <div>
              <label htmlFor="appt-deposit" className={label}>Deposit (KES)</label>
              <input id="appt-deposit" type="number" min={0} step={50} value={deposit / 100} onChange={(e) => setDeposit(Math.round(Number(e.target.value) * 100))} className={field} />
            </div>
            {onPipeline && deposit > 0 && (
              <div>
                <label htmlFor="appt-dep-method" className={label}>Deposit paid by</label>
                <select id="appt-dep-method" value={depositMethod} onChange={(e) => setDepositMethod(e.target.value)} className={field}>{PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
              </div>
            )}
            <div className="col-span-2">
              <label htmlFor="appt-notes" className={label}>Notes for this visit</label>
              <textarea id="appt-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={field} placeholder="Special requests" />
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t p-4 dark:border-gray-700">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={() => book.mutate()} disabled={!canBook} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {book.isPending ? 'Saving...' : 'Book appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}
