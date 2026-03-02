import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import { Plus, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

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

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; color: string }[]> = {
  BOOKED: [{ label: 'Confirm', next: 'CONFIRMED', color: 'bg-indigo-600' }, { label: 'Cancel', next: 'CANCELLED', color: 'bg-red-600' }],
  CONFIRMED: [{ label: 'Start', next: 'IN_PROGRESS', color: 'bg-amber-600' }, { label: 'Cancel', next: 'CANCELLED', color: 'bg-red-600' }],
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
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ['appointments', businessId, storeId, viewDate],
    queryFn: () => api.get(`/appointments?businessId=${businessId}&storeId=${storeId}&date=${viewDate}`),
    enabled: !!businessId && !!storeId,
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
    mutationFn: ({ id, ...data }: any) => api.patch(`/appointments/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['appointments'] }); },
  });

  const resetForm = () => setForm({
    customerName: '', customerPhone: '', serviceItem: '', staffId: '',
    scheduledAt: `${toDateStr(new Date())}T09:00`, duration: 60, notes: '', depositCents: 0,
  });

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
      <div className="flex items-center justify-between">
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
                  {appt.depositCents > 0 && <p className="text-xs text-gray-500 mt-0.5">Deposit: {formatKES(appt.depositCents)}</p>}
                </div>
                {transitions.length > 0 && canManage && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    {transitions.map((t) => (
                      <button key={t.next} onClick={() => updateMutation.mutate({ id: appt.id, status: t.next })}
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
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Deposit (KES)</label>
                  <input type="number" min="0" step="50" value={form.depositCents / 100}
                    onChange={(e) => setForm((f) => ({ ...f, depositCents: Math.round(Number(e.target.value) * 100) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Special requests, service details…" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate({ businessId, storeId, ...form, scheduledAt: new Date(form.scheduledAt).toISOString(), staffId: form.staffId || undefined })}
                disabled={!form.customerName || !form.scheduledAt || createMutation.isPending}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Saving…' : 'Book Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
