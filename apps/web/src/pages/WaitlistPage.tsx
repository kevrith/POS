import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Bell, X, Loader2, RefreshCw, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type WaitlistStatus = 'WAITING' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';

interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  estimatedWaitMinutes?: number;
  notes?: string;
  status: WaitlistStatus;
  notifiedAt?: string;
  seatedAt?: string;
  createdAt: string;
  position?: number;
}

interface CreateWaitlistDto {
  businessId: string;
  storeId?: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  estimatedWaitMinutes?: number;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: WaitlistStatus) {
  const map: Record<WaitlistStatus, string> = {
    WAITING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    SEATED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    NO_SHOW: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return map[status];
}

function timeWaiting(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (diff < 60) return `${diff}m`;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WaitlistPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | 'ALL'>('WAITING');
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    partySize: 2,
    estimatedWaitMinutes: 15,
    notes: '',
  });

  // Tick every minute to update "time waiting"
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  void now; // used to trigger re-render

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading, refetch } = useQuery<WaitlistEntry[]>({
    queryKey: ['waitlist', businessId, storeId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ businessId, storeId });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api.get(`/hospitality/waitlist?${params.toString()}`);
    },
    enabled: !!businessId,
    refetchInterval: 30_000,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: CreateWaitlistDto) => api.post('/hospitality/waitlist', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waitlist'] });
      setShowModal(false);
      setForm({ customerName: '', customerPhone: '', partySize: 2, estimatedWaitMinutes: 15, notes: '' });
    },
  });

  function action(id: string, act: 'seat' | 'notify' | 'no-show' | 'cancel') {
    return api.patch(`/hospitality/waitlist/${id}/${act}`, {}).then(() =>
      qc.invalidateQueries({ queryKey: ['waitlist'] })
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const STATUS_TABS: Array<{ value: WaitlistStatus | 'ALL'; label: string }> = [
    { value: 'WAITING', label: 'Waiting' },
    { value: 'SEATED', label: 'Seated' },
    { value: 'NO_SHOW', label: 'No Show' },
    { value: 'CANCELLED', label: 'Cancelled' },
    { value: 'ALL', label: 'All' },
  ];

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-500" />
            Waitlist
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage walk-in guest queue and estimated wait times
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add to Waitlist
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              statusFilter === t.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Queue count */}
      {statusFilter === 'WAITING' && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            {entries.length} {entries.length === 1 ? 'party' : 'parties'} waiting
          </span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No entries found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, idx) => (
            <div
              key={entry.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4"
            >
              <div className="flex items-start gap-4">
                {/* Position number */}
                {statusFilter === 'WAITING' && (
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-sm flex-shrink-0">
                    #{idx + 1}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{entry.customerName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(entry.status)}`}>
                      {entry.status}
                    </span>
                    {entry.notifiedAt && (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                        <Bell className="w-3 h-3" />
                        Notified {new Date(entry.notifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                    {entry.customerPhone && <span>{entry.customerPhone}</span>}
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      Party of {entry.partySize}
                    </span>
                    {entry.estimatedWaitMinutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        ~{entry.estimatedWaitMinutes}m est.
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs">
                      Waiting: {timeWaiting(entry.createdAt)}
                    </span>
                  </div>
                  {entry.notes && (
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{entry.notes}</p>
                  )}
                </div>

                {/* Actions */}
                {entry.status === 'WAITING' && (
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                    <button
                      onClick={() => action(entry.id, 'seat')}
                      className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      Seat
                    </button>
                    <button
                      onClick={() => action(entry.id, 'notify')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Bell className="w-3 h-3" />
                      Notify
                    </button>
                    <button
                      onClick={() => action(entry.id, 'no-show')}
                      className="px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium rounded-lg transition-colors"
                    >
                      No Show
                    </button>
                    <button
                      onClick={() => action(entry.id, 'cancel')}
                      className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add to Waitlist</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  businessId,
                  storeId: storeId || undefined,
                  customerName: form.customerName.trim(),
                  customerPhone: form.customerPhone.trim() || undefined,
                  partySize: Number(form.partySize),
                  estimatedWaitMinutes: form.estimatedWaitMinutes ? Number(form.estimatedWaitMinutes) : undefined,
                  notes: form.notes.trim() || undefined,
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Guest Name *</label>
                <input
                  type="text"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  required
                  placeholder="e.g. John Kamau"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="e.g. 0712345678"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party Size *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.partySize}
                    onChange={(e) => setForm((f) => ({ ...f, partySize: Number(e.target.value) }))}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Est. Wait (min)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.estimatedWaitMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, estimatedWaitMinutes: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Birthday party, wheelchair access needed"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {createMut.isError && (
                <p className="text-sm text-red-500">Failed to add entry. Please try again.</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add to Queue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
