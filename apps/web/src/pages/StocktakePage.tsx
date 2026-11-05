import { useState, useMemo } from 'react';
import { useDialog } from '../components/Dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, ClipboardList, CheckCircle2, AlertTriangle, Loader2,
  ChevronLeft, Search, Save, Lock, Trash2, FileText, TrendingUp,
  TrendingDown, RefreshCw,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StocktakeSession {
  id: string;
  name: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINALIZED';
  storeId: string;
  createdBy: string;
  notes?: string;
  startedAt?: string;
  finalizedAt?: string;
  createdAt: string;
  _count?: { counts: number };
}

interface StocktakeCount {
  id: string;
  itemId: string;
  itemName: string;
  systemQty: number;
  countedQty: number | null;
  varianceQty: number | null;
  note?: string;
}

interface SessionDetail extends StocktakeSession {
  counts: StocktakeCount[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case 'DRAFT':       return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'FINALIZED':   return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Sessions List ────────────────────────────────────────────────────────────

function SessionsList({
  sessions,
  onOpen,
  onDelete,
  onCreate,
}: {
  sessions: StocktakeSession[];
  onOpen: (s: StocktakeSession) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-gray-900 dark:text-white text-sm">Stocktake Sessions</h2>
          <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
            {sessions.length}
          </span>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <ClipboardList className="w-12 h-12 mb-3 opacity-25" />
          <p className="text-sm font-medium text-gray-500">No stocktake sessions yet</p>
          <p className="text-xs text-gray-400 mt-1">Create one to start counting inventory</p>
          <button
            onClick={onCreate}
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> New Session
          </button>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                {s.status === 'FINALIZED'
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : s.status === 'IN_PROGRESS'
                    ? <RefreshCw className="w-5 h-5 text-blue-500" />
                    : <ClipboardList className="w-5 h-5 text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{s.name}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusBadge(s.status)}`}>
                    {s.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {fmtDate(s.createdAt)} · {s._count?.counts ?? 0} items
                  {s.finalizedAt && ` · Finalized ${fmtDate(s.finalizedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => onOpen(s)}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                >
                  {s.status === 'FINALIZED' ? 'View' : 'Open'}
                </button>
                {s.status !== 'FINALIZED' && (
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" aria-label="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Count Sheet ──────────────────────────────────────────────────────────────

function CountSheet({
  session,
  onBack,
  onRefresh,
}: {
  session: SessionDetail;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [localCounts, setLocalCounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    session.counts.forEach((c) => {
      if (c.countedQty !== null && c.countedQty !== undefined) {
        init[c.id] = String(c.countedQty);
      }
    });
    return init;
  });
  const [showVarianceOnly, setShowVarianceOnly] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (updates: Array<{ countId: string; countedQty: number; note?: string; countedBy?: string }>) =>
      api.patch(`/stocktake/sessions/${session.id}/counts`, { updates }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocktake-session', session.id] });
      onRefresh();
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      api.post(`/stocktake/sessions/${session.id}/finalize`, { finalizedBy: user?.id ?? '' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocktake-sessions'] });
      void qc.invalidateQueries({ queryKey: ['stocktake-session', session.id] });
      setConfirmFinalize(false);
      onRefresh();
    },
  });

  const filtered = useMemo(() => {
    let list = session.counts;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.itemName.toLowerCase().includes(q));
    }
    if (showVarianceOnly) {
      list = list.filter((c) => {
        const counted = parseFloat(localCounts[c.id] ?? '');
        if (!isNaN(counted)) return counted !== c.systemQty;
        return c.varianceQty !== null && c.varianceQty !== 0;
      });
    }
    return list;
  }, [session.counts, search, showVarianceOnly, localCounts]);

  const pendingCount = session.counts.filter((c) => localCounts[c.id] === undefined && c.countedQty === null).length;
  const savedCount = session.counts.filter((c) => c.countedQty !== null).length;

  function handleSave() {
    const updates = Object.entries(localCounts)
      .map(([countId, val]) => ({
        countId,
        countedQty: parseInt(val, 10),
        countedBy: user?.id,
      }))
      .filter((u) => !isNaN(u.countedQty) && u.countedQty >= 0);
    saveMutation.mutate(updates);
  }

  const finalized = session.status === 'FINALIZED';

  // Variance summary
  const variances = session.counts.filter((c) => c.varianceQty !== null && c.varianceQty !== 0);
  const shortages = variances.filter((c) => (c.varianceQty ?? 0) < 0);
  const overages = variances.filter((c) => (c.varianceQty ?? 0) > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" aria-label="Previous">
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{session.name}</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusBadge(session.status)}`}>
                {session.status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-gray-500">{fmtDate(session.createdAt)} · {session.counts.length} items</p>
          </div>
          {!finalized && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={() => setConfirmFinalize(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700"
              >
                <Lock className="w-4 h-4" /> Finalize
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {!finalized && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{savedCount} of {session.counts.length} items counted</span>
              <span>{pendingCount} remaining</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${session.counts.length > 0 ? (savedCount / session.counts.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Variance summary (finalized) */}
        {finalized && variances.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-gray-900 dark:text-white">{variances.length}</p>
              <p className="text-xs text-gray-500">Total variances</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-600 dark:text-red-400">{shortages.length}</p>
              <p className="text-xs text-red-500">Shortages</p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{overages.length}</p>
              <p className="text-xs text-emerald-500">Overages</p>
            </div>
          </div>
        )}
      </div>

      {/* Count sheet */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-700 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {finalized && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showVarianceOnly}
                onChange={(e) => setShowVarianceOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              Variances only
            </label>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">{filtered.length} items</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-gray-700/30">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">System Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Counted</th>
                {finalized && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Variance</th>
                )}
                {!finalized && (
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((count) => {
                const localVal = localCounts[count.id] ?? '';
                const counted = localVal !== '' ? parseFloat(localVal) : count.countedQty;
                const variance = counted !== null && counted !== undefined ? counted - count.systemQty : null;
                const isCounted = counted !== null && counted !== undefined && !isNaN(counted as number);
                const hasVariance = variance !== null && variance !== 0;

                return (
                  <tr
                    key={count.id}
                    className={`border-b border-gray-50 dark:border-gray-700/50 transition-colors ${hasVariance ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                  >
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{count.itemName}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{count.systemQty}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {finalized ? (
                        <span className="text-sm font-mono font-semibold text-gray-900 dark:text-white">
                          {count.countedQty ?? <span className="text-gray-400">—</span>}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={localVal}
                          onChange={(e) => {
                            const raw = e.target.value;
                            // Only allow non-negative integers
                            if (raw === '' || /^\d+$/.test(raw)) {
                              setLocalCounts((prev) => ({ ...prev, [count.id]: raw }));
                            }
                          }}
                          onKeyDown={(e) => {
                            // Block decimal point and minus sign
                            if (e.key === '.' || e.key === ',' || e.key === '-') e.preventDefault();
                          }}
                          placeholder={count.countedQty !== null ? String(count.countedQty) : '0'}
                          className="w-24 text-right px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      )}
                    </td>
                    {finalized ? (
                      <td className="px-4 py-3 text-right">
                        {variance !== null ? (
                          <span className={`flex items-center justify-end gap-1 text-sm font-bold ${variance > 0 ? 'text-emerald-600' : variance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {variance > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : variance < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                            {variance > 0 ? '+' : ''}{variance}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not counted</span>
                        )}
                      </td>
                    ) : (
                      <td className="px-4 py-3 text-right">
                        {isCounted ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-end gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Counted
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Pending</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-sm text-gray-400">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finalize confirm modal */}
      {confirmFinalize && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Finalize Stocktake?</h3>
                <p className="text-xs text-gray-500">This will lock the session and apply adjustments</p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 mb-4 text-sm text-amber-800 dark:text-amber-300">
              <strong>Warning:</strong> Variance adjustments will be applied to your inventory. This cannot be undone.
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFinalize(false)}
                className="flex-1 px-4 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Finalize
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const businessId = user?.businessId ?? '';
  const [name, setName] = useState(`Stocktake ${new Date().toLocaleDateString('en-KE')}`);
  const [notes, setNotes] = useState('');
  const [storeId, setStoreId] = useState(user?.storeId ?? '');

  const { data: stores = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['stores-list', businessId],
    queryFn: () => api.get(`/business/${businessId}/stores`),
    enabled: !!businessId,
  });

  // Auto-select first store if storeId not set
  const effectiveStoreId = storeId || stores[0]?.id || '';

  const createMutation = useMutation({
    mutationFn: (dto: { businessId: string; storeId: string; name: string; createdBy: string; notes?: string }) =>
      api.post('/stocktake/sessions', dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stocktake-sessions'] });
      onCreated();
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !effectiveStoreId) return;
    createMutation.mutate({
      businessId,
      storeId: effectiveStoreId,
      name: name.trim(),
      createdBy: user?.id ?? '',
      notes: notes.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-lg">New Stocktake Session</h3>
            <p className="text-xs text-gray-500">Creates a count sheet from current inventory</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Session Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          {stores.length > 1 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Store
              </label>
              <select
                value={effectiveStoreId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Notes <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Monthly cycle count, full store..."
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
            />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
            A count sheet will be auto-generated with all stock-tracked items and their current system quantities.
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-semibold border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !effectiveStoreId}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StocktakePage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();
  const { confirm } = useDialog();

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: sessions = [], isLoading } = useQuery<StocktakeSession[]>({
    queryKey: ['stocktake-sessions', businessId, storeId],
    queryFn: () => api.get(`/stocktake/sessions?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  const { data: sessionDetail, refetch: refetchDetail } = useQuery<SessionDetail>({
    queryKey: ['stocktake-session', activeSession],
    queryFn: () => api.get(`/stocktake/sessions/${activeSession}`),
    enabled: !!activeSession,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/stocktake/sessions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stocktake-sessions'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Stocktake</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Cycle counts, variance reports, and inventory adjustments
        </p>
      </div>

      {activeSession && sessionDetail ? (
        <CountSheet
          session={sessionDetail}
          onBack={() => setActiveSession(null)}
          onRefresh={() => void refetchDetail()}
        />
      ) : (
        <SessionsList
          sessions={sessions}
          onOpen={(s) => setActiveSession(s.id)}
          onDelete={async (id) => {
            const ok = await confirm({ title: 'Delete Session', message: 'Delete this session? This cannot be undone.', variant: 'danger', confirmLabel: 'Delete' });
            if (ok) deleteMutation.mutate(id);
          }}
          onCreate={() => setShowCreate(true)}
        />
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: ['stocktake-sessions'] })}
        />
      )}
    </div>
  );
}
