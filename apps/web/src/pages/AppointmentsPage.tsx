import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, Loader2, Users, LayoutGrid, List, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { ReceiptData } from '../lib/printer';
import { buildDirectSaleReceipt } from '../lib/directSaleReceipt';
import { autoPrintReceipt, printErrorMessage } from '../lib/receiptPrint';
import DirectSaleReceiptModal from '../components/DirectSaleReceiptModal';
import { nairobiDay } from '../lib/nairobiDay';
import type { Appointment, Stylist } from '../lib/salon';
import BookingModal, { type CatalogueItem } from '../components/salon/BookingModal';
import CompleteModal, { type CompletePayload } from '../components/salon/CompleteModal';
import ClientPanel from '../components/salon/ClientPanel';
import DayBoard from '../components/salon/DayBoard';
import TeamModal from '../components/salon/TeamModal';
import CheckInModal from '../components/clinical/CheckInModal';

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

const shiftDay = (day: string, by: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

export default function AppointmentsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const qc = useQueryClient();

  const [viewDate, setViewDate] = useState(nairobiDay());
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [view, setView] = useState<'list' | 'board'>(() => (localStorage.getItem('appointments-view') === 'board' ? 'board' : 'list'));
  const [showCreate, setShowCreate] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [openAppt, setOpenAppt] = useState<Appointment | null>(null);
  const [clientOf, setClientOf] = useState<Appointment | null>(null);

  // What the owner has chosen to do with this business's takings, and the services that can be booked.
  const { data: bizSettings } = useQuery<{ name?: string; posMode?: string; verticalSalesEnabled?: boolean; receiptHeader?: string; receiptFooter?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });
  const onPipeline = !!bizSettings?.verticalSalesEnabled;
  // A clinic checks a booked patient in as a visit, so they join the queue with their booked services on the bill.
  const clinic = String(bizSettings?.posMode ?? '').toUpperCase() === 'CLINIC';
  const [checkingIn, setCheckingIn] = useState<Appointment | null>(null);
  const { data: catalogue = [] } = useQuery<CatalogueItem[]>({
    queryKey: ['items-for-appointments', businessId, storeId],
    queryFn: () => api.get(`/items?businessId=${businessId}&storeId=${storeId}&activeOnly=true`),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const services = catalogue.some((i) => i.type === 'SERVICE') ? catalogue.filter((i) => i.type === 'SERVICE') : catalogue;

  const { data: team } = useQuery<{ stylists: Stylist[] }>({
    queryKey: ['salon-staff'],
    queryFn: () => api.get('/appointments/staff'),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const stylists = useMemo(() => team?.stylists ?? [], [team]);
  const { data: users = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['business-users', businessId],
    queryFn: () => api.get(`/business/${businessId}/users`),
    enabled: !!businessId,
  });
  const nameOf = useMemo(() => {
    const m = new Map<string, string>(users.map((u) => [u.id, u.name]));
    for (const s of stylists) m.set(s.userId, s.name);
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [users, stylists]);

  // The window open over an appointment: taking a deposit, or cancelling / no-show with a deposit held.
  const [action, setAction] = useState<{ kind: 'deposit' | 'close'; appt: Appointment; next?: string } | null>(null);
  const [completing, setCompleting] = useState<Appointment | null>(null);
  const [pay, setPay] = useState({ method: 'CASH', tendered: '', refundMethod: 'CASH', keep: false });
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const canManage = isManager || user?.role === 'CASHIER' || user?.role === 'PHARMACIST';

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments', businessId, storeId, viewDate],
    queryFn: () => api.get(`/appointments?businessId=${businessId}&storeId=${storeId}&date=${viewDate}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => api.patch<unknown>(`/appointments/${id}`, data),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['client-history'] });
      void qc.invalidateQueries({ queryKey: ['salon-earnings'] });
      setAction(null);
      setCompleting(null);
      setOpenAppt(null);
      const data = buildDirectSaleReceipt((res ?? {}) as Parameters<typeof buildDirectSaleReceipt>[0], {
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

  /** A status button: on the pipeline, completing and closing with a deposit need a window; otherwise it is the plain change. */
  const press = (appt: Appointment, next: string) => {
    setPay({ method: 'CASH', tendered: '', refundMethod: 'CASH', keep: false });
    if (onPipeline && next === 'COMPLETED') return setCompleting(appt);
    if (onPipeline && (next === 'CANCELLED' || next === 'NO_SHOW') && appt.depositCents > 0) return setAction({ kind: 'close', appt, next });
    updateMutation.mutate({ id: appt.id, status: next });
  };

  const submitComplete = (appt: Appointment, p: CompletePayload) => updateMutation.mutate({ id: appt.id, status: 'COMPLETED', ...p });

  const setViewMode = (v: 'list' | 'board') => { setView(v); localStorage.setItem('appointments-view', v); };
  const prevDay = () => setViewDate((d) => shiftDay(d, -1));
  const nextDay = () => setViewDate((d) => shiftDay(d, 1));

  const filtered = appointments.filter((a) => statusFilter === 'ALL' || a.status === statusFilter);
  const stats = {
    total: appointments.length,
    confirmed: appointments.filter((a) => ['CONFIRMED', 'BOOKED'].includes(a.status)).length,
    completed: appointments.filter((a) => a.status === 'COMPLETED').length,
    noShows: appointments.filter((a) => a.status === 'NO_SHOW').length,
  };
  const isToday = viewDate === nairobiDay();
  const dayLabel = new Date(`${viewDate}T12:00:00Z`).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  /** One appointment as a card: time, client, what is being done and by whom, deposit, and the buttons. */
  const card = (appt: Appointment, boxed = true) => {
    const time = new Date(appt.scheduledAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' });
    const transitions = STATUS_TRANSITIONS[appt.status] ?? [];
    const svc = appt.services ?? [];
    const single = catalogue.find((i) => i.id === appt.serviceItemId);
    return (
      <div key={appt.id} className={boxed ? 'rounded-xl bg-white p-4 shadow dark:bg-gray-800' : ''}>
        <div className="flex items-start gap-4">
          <div className="w-14 flex-shrink-0 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{time}</p>
            <p className="text-xs text-gray-400">{appt.duration}min</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-gray-900 dark:text-white">{appt.customerName}</span>
              {appt.customerPhone && <span className="text-xs text-gray-400">{appt.customerPhone}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[appt.status] ?? ''}`}>{appt.status.replace('_', ' ')}</span>
              {appt.customerId && (
                <button onClick={() => setClientOf(appt)} className="text-xs font-medium text-blue-700 hover:underline">Client notes and history</button>
              )}
            </div>
            {appt.notes && <p className="mt-0.5 text-sm italic text-gray-500">{appt.notes}</p>}
            {svc.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                {svc.map((s, i) => (
                  <li key={i}>{s.name}{nameOf(s.staffId) ? ` with ${nameOf(s.staffId)}` : ''} - {s.durationMin} min - {formatKES(s.unitPriceCents)}</li>
                ))}
              </ul>
            ) : (
              <>
                {single && <p className="mt-0.5 text-xs text-gray-500">{single.name} - {formatKES(single.retailPriceCents)}{nameOf(appt.staffId) ? ` with ${nameOf(appt.staffId)}` : ''}</p>}
                {!single && nameOf(appt.staffId) && <p className="mt-0.5 text-xs text-gray-500">With {nameOf(appt.staffId)}</p>}
              </>
            )}
            {appt.depositCents > 0 && <p className="mt-0.5 text-xs text-gray-500">Deposit: {formatKES(appt.depositCents)}</p>}
          </div>
          {transitions.length > 0 && canManage && (
            <div className="flex flex-shrink-0 flex-wrap justify-end gap-1.5">
              {clinic && ['BOOKED', 'CONFIRMED'].includes(appt.status) && appt.depositCents === 0 && (
                <button onClick={() => setCheckingIn(appt)}
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Check in as visit</button>
              )}
              {['BOOKED', 'CONFIRMED', 'IN_PROGRESS'].includes(appt.status) && (
                <button onClick={() => { setPay({ method: 'CASH', tendered: '', refundMethod: 'CASH', keep: false }); setAction({ kind: 'deposit', appt }); }}
                  className="rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">Deposit</button>
              )}
              {transitions.map((t) => (
                <button key={t.next} onClick={() => press(appt, t.next)} disabled={updateMutation.isPending}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 ${t.color}`}>{t.label}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
            <CalendarDays className="h-5 w-5 text-blue-600" /> Appointments
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">{stats.total} appointment{stats.total !== 1 ? 's' : ''} {isToday ? 'today' : 'on this day'}</p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <button onClick={() => setShowTeam(true)} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-200">
              <Users className="h-4 w-4" /> Team
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Appointment
            </button>
          )}
        </div>
      </div>

      {/* Completing an appointment only makes a sale once the business has switched its takings over. Say so, instead of staying silent. */}
      {bizSettings && !onPipeline && (
        <div role="note" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            Completing an appointment here only marks it done: it does <strong>not</strong> make a receipt, take payment, count in the day's sales or earn the stylist commission.
            {isManager ? ' To make it a real sale, the owner turns on real sales for these takings in Settings, General.' : ' Ask the owner to turn on real sales for these takings in Settings.'}
          </p>
        </div>
      )}

      {/* Day nav + stats + view */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 shadow dark:bg-gray-800">
          <button onClick={prevDay} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setViewDate(nairobiDay())}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${isToday ? 'bg-blue-50 text-blue-700' : 'text-gray-700 dark:text-gray-200'}`}>
            {isToday ? 'Today' : new Date(`${viewDate}T12:00:00Z`).toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </button>
          <button onClick={nextDay} className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Next day"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Pending', value: stats.confirmed, color: 'bg-blue-100 text-blue-700' },
            { label: 'Completed', value: stats.completed, color: 'bg-green-100 text-green-700' },
            { label: 'No-Shows', value: stats.noShows, color: 'bg-red-100 text-red-600' },
          ].map((s) => (
            <span key={s.label} className={`rounded-full px-3 py-1.5 text-xs font-medium ${s.color}`}>{s.value} {s.label}</span>
          ))}
        </div>
        <div className="ml-auto flex rounded-lg bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="View">
          <button onClick={() => setViewMode('list')} aria-pressed={view === 'list'} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-white text-blue-600 shadow dark:bg-gray-700' : 'text-gray-500'}`}><List className="h-3.5 w-3.5" /> List</button>
          <button onClick={() => setViewMode('board')} aria-pressed={view === 'board'} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${view === 'board' ? 'bg-white text-blue-600 shadow dark:bg-gray-700' : 'text-gray-500'}`}><LayoutGrid className="h-3.5 w-3.5" /> By stylist</button>
        </div>
      </div>

      {view === 'board' ? (
        <DayBoard appointments={appointments} stylists={stylists} isToday={isToday} onOpen={setOpenAppt} />
      ) : (
        <>
          <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {['ALL', 'BOOKED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white text-blue-600 shadow dark:bg-gray-700' : 'text-gray-500 hover:text-gray-700'}`}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="rounded-xl bg-white p-12 text-center text-gray-400 shadow dark:bg-gray-800">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p>No appointments on {dayLabel}</p>
              </div>
            )}
            {filtered.map((appt) => card(appt))}
          </div>
        </>
      )}

      {showCreate && (
        <BookingModal
          businessId={businessId} storeId={storeId} services={services} stylists={stylists} onPipeline={onPipeline} defaultDay={viewDate}
          onClose={() => setShowCreate(false)}
          onBooked={() => { setShowCreate(false); void qc.invalidateQueries({ queryKey: ['appointments'] }); void qc.invalidateQueries({ queryKey: ['client-history'] }); }}
        />
      )}

      {showTeam && <TeamModal onClose={() => setShowTeam(false)} />}

      {/* An appointment opened from the board */}
      {openAppt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAppt(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Appointment" className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800">
            <div className="mb-2 flex justify-end"><button onClick={() => setOpenAppt(null)} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            {card(appointments.find((a) => a.id === openAppt.id) ?? openAppt, false)}
          </div>
        </div>
      )}

      {/* A client's notes and history */}
      {clientOf?.customerId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setClientOf(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Client" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{clientOf.customerName}</h2>
              <button onClick={() => setClientOf(null)} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <ClientPanel customerId={clientOf.customerId} />
          </div>
        </div>
      )}

      {completing && (
        <CompleteModal
          appointment={completing} catalogue={catalogue} stylists={stylists} canChangePrice={isManager} busy={updateMutation.isPending}
          onCancel={() => setCompleting(null)} onSubmit={(p) => submitComplete(completing, p)}
        />
      )}

      {/* Take a deposit, or cancel / no-show with a deposit held */}
      {action && (() => {
        const a = action.appt;
        const methodButtons = (value: string, set: (m: string) => void) => (
          <div className="grid grid-cols-4 gap-2">
            {PAY_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => set(m)} aria-pressed={value === m}
                className={`rounded-lg border py-2 text-xs font-semibold ${value === m ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-700 dark:text-gray-200'}`}>{m}</button>
            ))}
          </div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="border-b p-5 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {action.kind === 'deposit' ? 'Take a deposit' : action.next === 'NO_SHOW' ? 'No-show' : 'Cancel appointment'}
                </h2>
                <p className="text-sm text-gray-500">{a.customerName}</p>
              </div>
              <div className="space-y-3 p-5 text-sm">
                {action.kind === 'deposit' && (
                  <>
                    <input type="number" min="0" step="0.01" value={pay.tendered} onChange={(e) => setPay((p) => ({ ...p, tendered: e.target.value }))}
                      placeholder="Deposit amount (KES)" aria-label="Deposit amount" className="w-full rounded-lg border px-3 py-2 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                    {methodButtons(pay.method, (m) => setPay((p) => ({ ...p, method: m })))}
                  </>
                )}
                {action.kind === 'close' && (
                  <>
                    <p className="font-medium text-gray-700 dark:text-gray-200">Deposit held: {formatKES(a.depositCents)}</p>
                    <label className="flex items-center gap-2"><input type="radio" checked={!pay.keep} onChange={() => setPay((p) => ({ ...p, keep: false }))} /> Pay the deposit back</label>
                    {!pay.keep && (
                      <div>
                        <p className="mb-1 text-xs text-gray-500">If the way it was paid is not on record, pay back by:</p>
                        {methodButtons(pay.refundMethod, (m) => setPay((p) => ({ ...p, refundMethod: m })))}
                      </div>
                    )}
                    {isManager && <label className="flex items-center gap-2"><input type="radio" checked={pay.keep} onChange={() => setPay((p) => ({ ...p, keep: true }))} /> Keep the deposit (late cancellation or no-show)</label>}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t p-4 dark:border-gray-700">
                <button onClick={() => setAction(null)} className="rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700">Back</button>
                <button
                  disabled={updateMutation.isPending || depositMutation.isPending || (action.kind === 'deposit' && !(parseFloat(pay.tendered) > 0))}
                  onClick={() => {
                    if (action.kind === 'deposit') return depositMutation.mutate({ id: a.id, amountCents: Math.round((parseFloat(pay.tendered) || 0) * 100), method: pay.method });
                    return updateMutation.mutate({ id: a.id, status: action.next, refundMethod: pay.refundMethod, keepDeposit: pay.keep });
                  }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {(updateMutation.isPending || depositMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {action.kind === 'deposit' ? 'Record deposit' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {receipt && <DirectSaleReceiptModal receipt={receipt} title="Appointment completed" onClose={() => setReceipt(null)} />}
      {checkingIn && <CheckInModal appointment={checkingIn} onClose={() => setCheckingIn(null)} onDone={() => setCheckingIn(null)} />}
    </div>
  );
}
