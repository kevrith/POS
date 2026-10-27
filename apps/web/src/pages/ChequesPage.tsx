import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, X, Loader2, RefreshCw, Check, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChequeStatus = 'PENDING' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';
type ChequeType = 'RECEIVED' | 'ISSUED';

interface Cheque {
  id: string;
  chequeNumber: string;
  bankName: string;
  drawerName: string;
  amountCents: number;
  issueDate: string;
  clearanceDate?: string;
  status: ChequeStatus;
  type: ChequeType;
  notes?: string;
  createdAt: string;
}

interface CreateChequeDto {
  businessId: string;
  storeId: string;
  chequeNumber: string;
  bankName: string;
  drawerName: string;
  amountCents: number;
  issueDate: string;
  type: ChequeType;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: ChequeStatus) {
  const map: Record<ChequeStatus, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    CLEARED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    BOUNCED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return map[status];
}

function fmt(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChequesPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();

  const [tab, setTab] = useState<ChequeType>('RECEIVED');
  const [statusFilter, setStatusFilter] = useState<ChequeStatus | 'ALL'>('ALL');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    chequeNumber: '',
    bankName: '',
    drawerName: '',
    amount: '',
    issueDate: new Date().toISOString().slice(0, 10),
    type: 'RECEIVED' as ChequeType,
    notes: '',
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: cheques = [], isLoading, refetch } = useQuery<Cheque[]>({
    queryKey: ['cheques', businessId, tab, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ businessId, type: tab });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api.get(`/payments/cheques?${params.toString()}`);
    },
    enabled: !!businessId,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: CreateChequeDto) => api.post('/payments/cheques', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cheques'] });
      setShowModal(false);
      setForm({
        chequeNumber: '', bankName: '', drawerName: '', amount: '',
        issueDate: new Date().toISOString().slice(0, 10),
        type: 'RECEIVED', notes: '',
      });
    },
  });

  function updateStatus(id: string, status: ChequeStatus) {
    const clearanceDate = (status === 'CLEARED' || status === 'BOUNCED')
      ? new Date().toISOString().slice(0, 10)
      : undefined;
    return api.patch(`/payments/cheques/${id}/status`, { status, clearanceDate }).then(() =>
      qc.invalidateQueries({ queryKey: ['cheques'] })
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-500" />
            Cheque Management
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Track received and issued cheques
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
            onClick={() => { setForm((f) => ({ ...f, type: tab })); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Record Cheque
          </button>
        </div>
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit">
        {(['RECEIVED', 'ISSUED'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t === 'RECEIVED' ? 'Received' : 'Issued'}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {(['ALL', 'PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Summary badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {(['PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED'] as ChequeStatus[]).map((s) => {
          const count = cheques.filter((c) => c.status === s).length;
          const total = cheques.filter((c) => c.status === s).reduce((sum, c) => sum + c.amountCents, 0);
          return (
            <div key={s} className={`p-3 rounded-lg border ${statusBadge(s)} border-current border-opacity-20`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{s}</p>
              <p className="text-lg font-bold">{count}</p>
              {total > 0 && <p className="text-xs opacity-70">{fmt(total)}</p>}
            </div>
          );
        })}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : cheques.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No cheques recorded</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Cheque #</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Bank</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                    {tab === 'RECEIVED' ? 'Drawer' : 'Payee'}
                  </th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Issue Date</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Clearance</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {cheques.map((ch) => (
                  <tr key={ch.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{ch.chequeNumber}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{ch.bankName}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{ch.drawerName}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(ch.amountCents)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(ch.issueDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {ch.clearanceDate ? new Date(ch.clearanceDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(ch.status)}`}>
                        {ch.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {ch.status === 'PENDING' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => updateStatus(ch.id, 'CLEARED')}
                            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                            title="Mark Cleared"
                          >
                            <Check className="w-3 h-3" />
                            Cleared
                          </button>
                          <button
                            onClick={() => updateStatus(ch.id, 'BOUNCED')}
                            className="flex items-center gap-1 px-2 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium rounded transition-colors"
                            title="Mark Bounced"
                          >
                            <XCircle className="w-3 h-3" />
                            Bounced
                          </button>
                          <button
                            onClick={() => updateStatus(ch.id, 'CANCELLED')}
                            className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium rounded transition-colors"
                            title="Cancel"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Cheque Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Record Cheque</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  businessId,
                  storeId,
                  chequeNumber: form.chequeNumber.trim(),
                  bankName: form.bankName.trim(),
                  drawerName: form.drawerName.trim(),
                  amountCents: Math.round(Number(form.amount) * 100),
                  issueDate: form.issueDate,
                  type: form.type,
                  notes: form.notes.trim() || undefined,
                });
              }}
              className="p-6 space-y-4"
            >
              {/* Type toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
                <div className="flex gap-2">
                  {(['RECEIVED', 'ISSUED'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.type === t
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cheque # *</label>
                  <input
                    type="text"
                    value={form.chequeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, chequeNumber: e.target.value }))}
                    required
                    placeholder="e.g. 001234"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (KES) *</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bank Name *</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                  required
                  placeholder="e.g. KCB, Equity, Co-op"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {form.type === 'RECEIVED' ? 'Drawer Name' : 'Payee Name'} *
                </label>
                <input
                  type="text"
                  value={form.drawerName}
                  onChange={(e) => setForm((f) => ({ ...f, drawerName: e.target.value }))}
                  required
                  placeholder="Full name on cheque"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Issue Date *</label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {createMut.isError && (
                <p className="text-sm text-red-500">Failed to record cheque. Please try again.</p>
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
                  Record Cheque
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
