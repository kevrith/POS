import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ReceiptData } from '../lib/printer';
import { buildDirectSaleReceipt } from '../lib/directSaleReceipt';
import { autoPrintReceipt, printErrorMessage } from '../lib/receiptPrint';
import DirectSaleReceiptModal from '../components/DirectSaleReceiptModal';

interface Appointment {
  id: string;
  customerName: string;
  customerPhone?: string;
  serviceItemId?: string;
  staffId?: string;
  scheduledAt: string;
  duration: number;
  status: string;
  notes?: string;
  depositCents: number;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  BOOKED: 'bg-blue-100 text-blue-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  NO_SHOW: 'bg-red-100 text-red-600',
};

const PAY_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string }[]> = {
  BOOKED: [{ label: 'Confirm', next: 'CONFIRMED', color: 'bg-indigo-600' }, { label: 'Cancel', next: 'CANCELLED', color: 'bg-red-600' }, { label: 'No-Show', next: 'NO_SHOW', color: 'bg-gray-600' }],
  CONFIRMED: [{ label: 'Start', next: 'IN_PROGRESS', color: 'bg-amber-600' }, { label: 'Cancel', next: 'CANCELLED', color: 'bg-red-600' }, { label: 'No-Show', next: 'NO_SHOW', color: 'bg-gray-600' }],
  IN_PROGRESS: [{ label: 'Complete', next: 'COMPLETED', color: 'bg-green-600' }, { label: 'No-Show', next: 'NO_SHOW', color: 'bg-red-600' }],
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const qc = useQueryClient();

  const [viewDate, setViewDate] = useState(toDateStr(new Date()));
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    serviceItem: '',
    staffId: '',
    scheduledAt: `${toDateStr(new Date())}T09:00`,
    duration: 60,
    notes: '',
    depositCents: 0,
    depositMethod: 'CASH',
    serviceItemId: '',
  });

  // What the owner has chosen to do with this business's takings, and the services that can be booked.
  const { data: bizSettings } = useQuery<{ name?: string; verticalSalesEnabled?: boolean; receiptHeader?: string; receiptFooter?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });
  const onPipeline = !!bizSettings?.verticalSalesEnabled;
  const { data: catalogue = [] } = useQuery<Array<{ id: string; name: string; type?: string; retailPriceCents: number }>>({
    queryKey: ['items-for-appointments', businessId, storeId],
    queryFn: () => api.get(`/items?businessId=${businessId}&storeId=${storeId}&activeOnly=true`),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const services = catalogue.some((i) => i.type === 'SERVICE') ? catalogue.filter((i) => i.type === 'SERVICE') : catalogue;
  const serviceOf = (id?: string) => catalogue.find((i) => i.id === id);

  // The window open over an appointment: completing it (payment), taking a deposit, or cancelling / no-show with a deposit held.
  const [action, setAction] = useState<{ kind: 'complete' | 'deposit' | 'close'; appt: Appointment; next?: string } | null>(null);
  const [pay, setPay] = useState({ method: 'CASH', tendered: '', price: '', kraPin: '', refundMethod: 'CASH', keep: false });
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const canKeep = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments', businessId, storeId, viewDate],
    queryFn: () => api.get(`/appointments?businessId=${businessId}&storeId=${storeId}&date=${viewDate}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const { data: users = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['business-users', businessId],
    queryFn: () => api.get(`/business/${businessId}/users`),
    enabled: !!businessId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/appointments', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['appointments'] }); setShowCreate(false); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch<any>(`/appointments/${id}`, data),
    onSuccess: (res: any) => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      setAction(null);
      const data = buildDirectSaleReceipt(res ?? {}, {
        businessName: bizSettings?.name, cashierName: user?.name, receiptHeader: bizSettings?.receiptHeader, receiptFooter: bizSettings?.receiptFooter, fallbackName: 'Appointments',
      });
      if (data) {
        setReceipt(data);
        void autoPrintReceipt(data, false).catch((err) => toast.error(`Auto-print failed: ${printErrorMessage(err)}`));
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const depositMutation = useMutation({
    mutationFn: ({ id, amountCents, method }: { id: string; amountCents: number; method: string }) => api.post(`/appointments/${id}/deposit`, { amountCents, method }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['appointments'] }); setAction(null); toast.success('Deposit recorded'); },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetForm = () => setForm({
    customerName: '', customerPhone: '', serviceItem: '', staffId: '',
    scheduledAt: `${toDateStr(new Date())}T09:00`, duration: 60, notes: '', depositCents: 0, depositMethod: 'CASH', serviceItemId: '',
  });

  /** A status button: on the pipeline, completing and closing with a deposit need a window; otherwise it is the plain change. */
  const press = (appt: Appointment, next: string) => {
    setPay({ method: 'CASH', tendered: '', price: '', kraPin: '', refundMethod: 'CASH', keep: false });
    if (onPipeline && next === 'COMPLETED') return setAction({ kind: 'complete', appt, next });
    if (onPipeline && (next === 'CANCELLED' || next === 'NO_SHOW') && appt.depositCents > 0) return setAction({ kind: 'close', appt, next });
    updateMutation.mutate({ id: appt.id, status: next });
  };

  const prevDay = () => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(toDateStr(d)); };
  const nextDay = () => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); setViewDate(toDateStr(d)); };

  const filtered = appointments.filter((a) => statusFilter === 'ALL' || a.status === statusFilter);

  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => ['CONFIRMED', 'BOOKED'].includes(a.status)).length,
    completed: appointments.filter((a) => a.status === 'COMPLETED').length,
    noShows: appointments.filter((a) => a.status === 'NO_SHOW').length,
  };

  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'CASHIER';
  const isToday = viewDate === toDateStr(new Date());

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" /> Appointments
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total} appointment{stats.total !== 1 ? 's' : ''} today</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Appointment
          </button>
        )}
      </div>

      {/* Day nav + stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg shadow px-2 py-1">
          <button onClick={prevDay} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setViewDate(toDateStr(new Date()))}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${isToday ? 'bg-blue-50 text-blue-700' : 'text-gray-700 dark:text-gray-200'}`}>
            {isToday ? 'Today' : new Date(viewDate).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}
          </button>
          <button onClick={nextDay} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"><ChevronRight className="w-4 h-4" /></button>
        </div>
        {/* Stats chips */}
        <div className="flex gap-2">
          {[
            { label: 'Pending', value: stats.confirmed, color: 'bg-blue-100 text-blue-700' },
            { label: 'Completed', value: stats.completed, color: 'bg-green-100 text-green-700' },
            { label: 'No-Shows', value: stats.noShows, color: 'bg-red-100 text-red-600' },
          ].map((s) => (
            <span key={s.label} className={`px-3 py-1.5 rounded-full text-xs font-medium ${s.color}`}>
              {s.value} {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {['ALL', 'BOOKED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Appointments list */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-12 text-center text-gray-400">
            <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No appointments on {new Date(viewDate).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
        )}
        {filtered.map((appt) => {
          const time = new Date(appt.scheduledAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
          const transitions = STATUS_TRANSITIONS[appt.status] ?? [];
          return (
            <div key={appt.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <div className="flex items-start gap-4">
                <div className="text-center w-14 flex-shrink-0">
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{time}</p>
                  <p className="text-xs text-gray-400">{appt.duration}min</p>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{appt.customerName}</span>
                    {appt.customerPhone && <span className="text-xs text-gray-400">{appt.customerPhone}</span>}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[appt.status] ?? ''}`}>{appt.status.replace('_', ' ')}</span>
                  </div>
                  {appt.notes && <p className="text-sm text-gray-500 mt-0.5 italic">{appt.notes}</p>}
                  {serviceOf(appt.serviceItemId) && <p className="text-xs text-gray-500 mt-0.5">{serviceOf(appt.serviceItemId)?.name} · {formatKES(serviceOf(appt.serviceItemId)?.retailPriceCents ?? 0)}</p>}
                  {appt.depositCents > 0 && <p className="text-xs text-gray-500 mt-0.5">Deposit: {formatKES(appt.depositCents)}</p>}
                </div>
                {transitions.length > 0 && canManage && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {['BOOKED', 'CONFIRMED', 'IN_PROGRESS'].includes(appt.status) && (
                      <button onClick={() => { setPay({ method: 'CASH', tendered: '', price: '', kraPin: '', refundMethod: 'CASH', keep: false }); setAction({ kind: 'deposit', appt }); }}
                        className="px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50">
                        Deposit
                      </button>
                    )}
                    {transitions.map((t) => (
                      <button key={t.next} onClick={() => press(appt, t.next)}
                        disabled={updateMutation.isPending}
                        className={`px-3 py-1.5 text-xs font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50 ${t.color}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Appointment</h2>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Customer Name *</label>
                  <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                  <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0712 345 678" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Assigned Staff</label>
                  <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">Any staff</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date & Time *</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Duration</label>
                  <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Service</label>
                  <select value={form.serviceItemId} onChange={(e) => setForm((f) => ({ ...f, serviceItemId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">Not chosen yet</option>
                    {services.map((i) => <option key={i.id} value={i.id}>{i.name} · {formatKES(i.retailPriceCents)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deposit (KES)</label>
                  <input type="number" min="0" step="50" value={form.depositCents / 100}
                    onChange={(e) => setForm((f) => ({ ...f, depositCents: Math.round(Number(e.target.value) * 100) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0" />
                </div>
                {onPipeline && form.depositCents > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deposit paid by</label>
                    <select value={form.depositMethod} onChange={(e) => setForm((f) => ({ ...f, depositMethod: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                      {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Special requests, service details…" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate({ businessId, storeId, ...form, serviceItemId: form.serviceItemId || undefined, scheduledAt: new Date(form.scheduledAt).toISOString(), staffId: form.staffId || undefined })}
                disabled={!form.customerName || !form.scheduledAt || createMutation.isPending}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Saving…' : 'Book Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete, take a deposit, or cancel / no-show with a deposit held */}
      {action && (() => {
        const a = action.appt;
        const item = serviceOf(a.serviceItemId);
        const listPrice = item?.retailPriceCents ?? 0;
        const asked = Math.round((parseFloat(pay.price) || 0) * 100);
        const price = asked > 0 ? asked : listPrice;
        const applied = Math.min(a.depositCents, price);
        const due = Math.max(0, price - applied);
        const tendered = Math.round((parseFloat(pay.tendered) || 0) * 100);
        const paying = tendered > 0 ? tendered : due;
        const methodButtons = (value: string, set: (m: string) => void) => (
          <div className="grid grid-cols-4 gap-2">
            {PAY_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => set(m)}
                className={`py-2 rounded-lg text-xs font-semibold border ${value === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 dark:text-gray-200'}`}>{m}</button>
            ))}
          </div>
        );
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
              <div className="p-5 border-b dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {action.kind === 'complete' ? 'Complete and take payment' : action.kind === 'deposit' ? 'Take a deposit' : action.next === 'NO_SHOW' ? 'No-show' : 'Cancel appointment'}
                </h2>
                <p className="text-sm text-gray-500">{a.customerName}</p>
              </div>
              <div className="p-5 space-y-3 text-sm">
                {action.kind === 'complete' && (
                  <>
                    <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3 space-y-1">
                      <div className="flex justify-between"><span>{item?.name ?? 'Service not chosen'}</span><span className="font-medium">{listPrice > 0 ? formatKES(listPrice) : '-'}</span></div>
                      {a.depositCents > 0 && <div className="flex justify-between text-gray-500"><span>Deposit held</span><span>- {formatKES(applied)}</span></div>}
                      <div className="flex justify-between border-t pt-1 font-bold"><span>To pay now</span><span>{formatKES(due)}</span></div>
                      {a.depositCents > price && price > 0 && <p className="text-amber-700 text-xs">{formatKES(a.depositCents - price)} of the deposit is paid back.</p>}
                    </div>
                    {(listPrice === 0 || canKeep) && (
                      <input type="number" min="0" step="0.01" value={pay.price} onChange={(e) => setPay((p) => ({ ...p, price: e.target.value }))}
                        placeholder={listPrice > 0 ? `Change the price (KES ${(listPrice / 100).toFixed(2)})` : 'Price (KES)'}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    )}
                    {due > 0 && (
                      <>
                        {methodButtons(pay.method, (m) => setPay((p) => ({ ...p, method: m })))}
                        <input type="number" min="0" step="0.01" value={pay.tendered} onChange={(e) => setPay((p) => ({ ...p, tendered: e.target.value }))}
                          placeholder={`Amount received (${(due / 100).toFixed(2)})`} className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                        {paying < due && <p className="text-xs text-red-600">Less than the amount due.</p>}
                        {pay.method === 'CASH' && paying > due && <p className="text-xs text-green-700">Change due: {formatKES(paying - due)}</p>}
                      </>
                    )}
                    {a.depositCents > price && price > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">If the way the deposit was paid is not on record, pay the rest back by:</p>
                        {methodButtons(pay.refundMethod, (m) => setPay((p) => ({ ...p, refundMethod: m })))}
                      </div>
                    )}
                    <input value={pay.kraPin} onChange={(e) => setPay((p) => ({ ...p, kraPin: e.target.value.toUpperCase() }))}
                      placeholder="Buyer KRA PIN (company customer, optional)" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </>
                )}
                {action.kind === 'deposit' && <DepositFields pay={pay} setPay={setPay} methodButtons={methodButtons} />}
                {action.kind === 'close' && (
                  <>
                    <p className="font-medium text-gray-700 dark:text-gray-200">Deposit held: {formatKES(a.depositCents)}</p>
                    <label className="flex items-center gap-2"><input type="radio" checked={!pay.keep} onChange={() => setPay((p) => ({ ...p, keep: false }))} /> Pay the deposit back</label>
                    {!pay.keep && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">If the way it was paid is not on record, pay back by:</p>
                        {methodButtons(pay.refundMethod, (m) => setPay((p) => ({ ...p, refundMethod: m })))}
                      </div>
                    )}
                    {canKeep && <label className="flex items-center gap-2"><input type="radio" checked={pay.keep} onChange={() => setPay((p) => ({ ...p, keep: true }))} /> Keep the deposit (late cancellation or no-show)</label>}
                  </>
                )}
              </div>
              <div className="p-4 border-t dark:border-gray-700 grid grid-cols-2 gap-3">
                <button onClick={() => setAction(null)} className="py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm">Back</button>
                <button
                  disabled={updateMutation.isPending || depositMutation.isPending || (action.kind === 'complete' && (price <= 0 || (due > 0 && paying < due))) || (action.kind === 'deposit' && !(parseFloat(pay.tendered) > 0))}
                  onClick={() => {
                    if (action.kind === 'deposit') return depositMutation.mutate({ id: a.id, amountCents: Math.round((parseFloat(pay.tendered) || 0) * 100), method: pay.method });
                    if (action.kind === 'complete') {
                      return updateMutation.mutate({
                        id: a.id, status: 'COMPLETED',
                        payments: due > 0 ? [{ method: pay.method, amountCents: paying }] : [],
                        amountCents: asked > 0 ? asked : undefined,
                        buyerKraPin: pay.kraPin.trim() || undefined,
                        refundMethod: pay.refundMethod,
                      });
                    }
                    return updateMutation.mutate({ id: a.id, status: action.next, refundMethod: pay.refundMethod, keepDeposit: pay.keep });
                  }}
                  className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {(updateMutation.isPending || depositMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {action.kind === 'complete' ? 'Complete' : action.kind === 'deposit' ? 'Record deposit' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {receipt && <DirectSaleReceiptModal receipt={receipt} title="Appointment completed" onClose={() => setReceipt(null)} />}
    </div>
  );
}

/** Amount and method for a deposit (the amount goes in the `tendered` box of the shared form state). */
function DepositFields({ pay, setPay, methodButtons }: {
  pay: { method: string; tendered: string };
  setPay: (f: (p: any) => any) => void;
  methodButtons: (value: string, set: (m: string) => void) => React.ReactNode;
}) {
  return (
    <>
      <input type="number" min="0" step="0.01" value={pay.tendered} onChange={(e) => setPay((p) => ({ ...p, tendered: e.target.value }))}
        placeholder="Deposit amount (KES)" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
      {methodButtons(pay.method, (m) => setPay((p) => ({ ...p, method: m })))}
    </>
  );
}
