import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, X, Loader2, RefreshCw, Copy, Check, Ban } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type LinkStatus = 'ACTIVE' | 'EXPIRED' | 'DISABLED';

interface PaymentLink {
  id: string;
  code: string;
  description?: string;
  amountCents: number;
  currency: string;
  status: LinkStatus;
  usesCount: number;
  maxUses?: number;
  expiresAt?: string;
  createdAt: string;
}

interface CreateLinkDto {
  businessId: string;
  description?: string;
  amountCents: number;
  currency: string;
  expiresAt?: string;
  maxUses?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: LinkStatus) {
  const map: Record<LinkStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    EXPIRED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    DISABLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return map[status];
}

function fmt(cents: number) {
  if (cents === 0) return 'Open';
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentLinksPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'KES',
    expiresAt: '',
    maxUses: '',
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: links = [], isLoading, refetch } = useQuery<PaymentLink[]>({
    queryKey: ['payment-links', businessId],
    queryFn: () => api.get(`/payments/links?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: CreateLinkDto) => api.post('/payments/links', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-links'] });
      setShowModal(false);
      setForm({ description: '', amount: '', currency: 'KES', expiresAt: '', maxUses: '' });
    },
  });

  const disableMut = useMutation({
    mutationFn: (id: string) => api.patch(`/payments/links/${id}/disable`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-links'] }),
  });

  function copyLink(code: string) {
    const url = `https://pay.kastrapos.com/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const activeLinks = links.filter((l) => l.status === 'ACTIVE');
  const inactiveLinks = links.filter((l) => l.status !== 'ACTIVE');

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Link2 className="w-6 h-6 text-violet-500" />
            Payment Links
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Create shareable payment links for customers
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
            Create Link
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Total Links</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{links.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Active</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{activeLinks.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Total Uses</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {links.reduce((s, l) => s + l.usesCount, 0)}
          </p>
        </div>
      </div>

      {/* Links list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No payment links yet</p>
          <p className="text-sm mt-1">Create your first link to share with customers</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active links */}
          {activeLinks.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Active</h2>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                {renderTable(activeLinks)}
              </div>
            </div>
          )}

          {/* Inactive links */}
          {inactiveLinks.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Inactive</h2>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden opacity-70">
                {renderTable(inactiveLinks)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create Payment Link</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMut.mutate({
                  businessId,
                  description: form.description.trim() || undefined,
                  amountCents: form.amount ? Math.round(Number(form.amount) * 100) : 0,
                  currency: form.currency,
                  expiresAt: form.expiresAt || undefined,
                  maxUses: form.maxUses ? Number(form.maxUses) : undefined,
                });
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Invoice #123, Deposit for event"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    placeholder="0 = Open amount"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Leave 0 for open amount</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Currency</label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expires At</label>
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Uses</label>
                  <input
                    type="number"
                    min="1"
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                    placeholder="Unlimited"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {createMut.isError && (
                <p className="text-sm text-red-500">Failed to create link. Please try again.</p>
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
                  Create Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  function renderTable(rows: PaymentLink[]) {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Code / URL</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Description</th>
            <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Amount</th>
            <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Uses</th>
            <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
            <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Expires</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((link) => {
            const url = `https://pay.kastrapos.com/${link.code}`;
            const copied = copiedCode === link.code;
            return (
              <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-gray-700 dark:text-gray-300">
                      {link.code}
                    </span>
                    <button
                      onClick={() => copyLink(link.code)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                        copied
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-[200px]">{url}</p>
                </td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{link.description ?? '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{fmt(link.amountCents)}</td>
                <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">
                  {link.usesCount}{link.maxUses ? `/${link.maxUses}` : ''}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(link.status)}`}>
                    {link.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {link.status === 'ACTIVE' && (
                    <button
                      onClick={() => disableMut.mutate(link.id)}
                      disabled={disableMut.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium rounded-lg transition-colors"
                    >
                      <Ban className="w-3 h-3" />
                      Disable
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }
}
