import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Check, X, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DamagedGoods {
  id: string;
  itemId: string;
  quantity: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  costCents?: number;
  notes?: string;
  createdAt: string;
  authorizedBy?: string;
  item?: { name: string; sku?: string };
}

interface CreateDamagedGoodsDto {
  businessId: string;
  storeId?: string;
  itemId: string;
  quantity: number;
  reason: string;
  costCents?: number;
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function fmt(cents?: number) {
  if (!cents) return '—';
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DamagedGoodsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    itemId: '',
    quantity: 1,
    reason: '',
    costCents: '',
    notes: '',
  });

  const canApprove = user?.role === 'OWNER' || user?.role === 'MANAGER';

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: records = [], isLoading, refetch } = useQuery<DamagedGoods[]>({
    queryKey: ['damaged-goods', businessId, storeId],
    queryFn: () => api.get(`/damaged-goods?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: CreateDamagedGoodsDto) => api.post('/damaged-goods', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damaged-goods'] });
      setShowModal(false);
      setForm({ itemId: '', quantity: 1, reason: '', costCents: '', notes: '' });
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/damaged-goods/${id}/approve`, { authorizedBy: user?.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damaged-goods'] }),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/damaged-goods/${id}/reject`, { authorizedBy: user?.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damaged-goods'] }),
  });

  // ─── Handlers ─────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      businessId,
      storeId: storeId || undefined,
      itemId: form.itemId.trim(),
      quantity: Number(form.quantity),
      reason: form.reason.trim(),
      costCents: form.costCents ? Math.round(Number(form.costCents) * 100) : undefined,
      notes: form.notes.trim() || undefined,
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            Damaged Goods
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Write-off workflow for damaged or unusable inventory
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
            Add Write-off
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : records.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No damaged goods records yet</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Item</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Qty</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Reason</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Cost</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Date</th>
                {canApprove && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {r.item?.name ?? r.itemId}
                    </span>
                    {r.item?.sku && (
                      <span className="ml-2 text-xs text-gray-400">{r.item.sku}</span>
                    )}
                    {r.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{r.notes}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700 dark:text-gray-300">{r.quantity}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[180px] truncate">{r.reason}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(r.costCents)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  {canApprove && (
                    <td className="px-4 py-3">
                      {r.status === 'PENDING' && (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => approveMut.mutate(r.id)}
                            disabled={approveMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => rejectMut.mutate(r.id)}
                            disabled={rejectMut.isPending}
                            className="flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium rounded-lg transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Write-off</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Item ID / Barcode *</label>
                <input
                  type="text"
                  value={form.itemId}
                  onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
                  required
                  placeholder="Enter item ID or scan barcode"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cost (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costCents}
                    onChange={(e) => setForm((f) => ({ ...f, costCents: e.target.value }))}
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason *</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  required
                  placeholder="e.g. Broken in transit, expired, spilled"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Additional details..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              {createMut.isError && (
                <p className="text-sm text-red-500">Failed to create write-off. Please try again.</p>
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
                  Submit Write-off
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
