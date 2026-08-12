import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileText, Plus, ChevronDown, ChevronRight, Send, Award, X, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type RFQStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'AWARDED' | 'CANCELLED';

interface RFQItem {
  id: string;
  itemId: string;
  quantityNeeded: number;
  itemName?: string;
  itemSku?: string | null;
}

interface RFQResponse {
  id: string;
  supplierId: string;
  supplier?: { id: string; name: string };
  quotedPriceCents: number;
  deliveryDays?: number | null;
  validUntil?: string | null;
  notes?: string;
  status: 'PENDING' | 'AWARDED' | 'REJECTED';
}

interface RFQ {
  id: string;
  rfqNumber: string;
  businessId: string;
  notes?: string;
  deadline?: string;
  status: RFQStatus;
  createdAt: string;
  items: RFQItem[];
  responses: RFQResponse[];
}

interface Supplier {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  name: string;
  sku?: string | null;
}

interface RFQFormItem {
  itemId: string;
  quantityNeeded: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: RFQStatus) {
  const map: Record<RFQStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    RECEIVED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    AWARDED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return map[status];
}

function responseBadge(status: string) {
  if (status === 'AWARDED') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  if (status === 'REJECTED') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function fmt(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

const emptyItem = (): RFQFormItem => ({ itemId: '', quantityNeeded: 1 });

// ─── Quote entry form ─────────────────────────────────────────────────────────

function QuoteForm({
  rfqId, suppliers, onSaved,
}: {
  rfqId: string;
  suppliers: Supplier[];
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const [days, setDays] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/suppliers/rfq/${rfqId}/responses`, {
        supplierId,
        quotedPriceCents: Math.round(parseFloat(price || '0') * 100),
        deliveryDays: days ? Number(days) : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Quote recorded');
      setSupplierId(''); setPrice(''); setDays(''); setNotes('');
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save the quote'),
  });

  return (
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-3">
      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
        Record a supplier quote
      </h4>
      <div className="flex flex-wrap gap-2 items-end">
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="flex-1 min-w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        >
          <option value="">Select supplier…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input
          type="number" min="0" step="0.01" value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Quoted total (KES)"
          className="w-44 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
        <input
          type="number" min="0" value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="Lead days"
          className="w-28 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
        <input
          type="text" value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="flex-1 min-w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
        <button
          onClick={() => mutation.mutate()}
          disabled={!supplierId || !price || mutation.isPending}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving…' : 'Add quote'}
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RFQPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();

  const [tab, setTab] = useState<'list' | 'create'>('list');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [formNotes, setFormNotes] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formItems, setFormItems] = useState<RFQFormItem[]>([emptyItem()]);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: rfqs = [], isLoading, refetch, error } = useQuery<RFQ[]>({
    queryKey: ['rfqs', businessId],
    queryFn: () => api.get(`/suppliers/rfq?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', businessId],
    queryFn: () => api.get(`/suppliers?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['rfq-items', businessId],
    queryFn: () => api.get(`/items?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: object) => api.post('/suppliers/rfq', dto),
    onSuccess: () => {
      toast.success('RFQ created');
      qc.invalidateQueries({ queryKey: ['rfqs'] });
      setTab('list');
      setFormNotes('');
      setFormDeadline('');
      setFormItems([emptyItem()]);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create RFQ'),
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => api.patch(`/suppliers/rfq/${id}/send`, {}),
    onSuccess: () => {
      toast.success('RFQ marked as sent');
      qc.invalidateQueries({ queryKey: ['rfqs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const awardMut = useMutation({
    mutationFn: ({ rfqId, rid }: { rfqId: string; rid: string }) =>
      api.patch(`/suppliers/rfq/${rfqId}/responses/${rid}/award`, {}),
    onSuccess: () => {
      toast.success('Quote awarded');
      qc.invalidateQueries({ queryKey: ['rfqs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Form helpers ─────────────────────────────────────────────────────────

  function addItem() {
    setFormItems((list) => [...list, emptyItem()]);
  }

  function removeItem(idx: number) {
    setFormItems((list) => list.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof RFQFormItem, value: string | number) {
    setFormItems((list) => list.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      businessId,
      storeId: user?.storeId,
      notes: formNotes.trim() || undefined,
      deadline: formDeadline || undefined,
      items: formItems
        .filter((i) => i.itemId.trim() && i.quantityNeeded > 0)
        .map((i) => ({ itemId: i.itemId, quantityNeeded: i.quantityNeeded })),
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-500" />
            Request for Quotation
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Compare supplier quotes and award the best bid
          </p>
        </div>
        {tab === 'list' && (
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([{ id: 'list', label: 'RFQs' }, { id: 'create', label: 'Create RFQ' }] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* RFQs list */}
      {tab === 'list' && (
        isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-600">{(error as Error).message}</div>
        ) : rfqs.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No RFQs yet</p>
            <button
              onClick={() => setTab('create')}
              className="mt-3 inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Plus className="w-4 h-4" /> Create your first RFQ
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rfqs.map((rfq) => {
              const isExpanded = expanded === rfq.id;
              const best = rfq.responses.length
                ? Math.min(...rfq.responses.map((r) => r.quotedPriceCents))
                : 0;
              return (
                <div key={rfq.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                  {/* RFQ header row */}
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : rfq.id)}
                  >
                    <button className="text-gray-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{rfq.rfqNumber}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(rfq.status)}`}>
                      {rfq.status}
                    </span>
                    {rfq.notes && (
                      <span className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">{rfq.notes}</span>
                    )}
                    {rfq.deadline && (
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        Due: {new Date(rfq.deadline).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {rfq.responses.length} quote{rfq.responses.length !== 1 ? 's' : ''}
                    </span>
                    {rfq.status === 'DRAFT' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); sendMut.mutate(rfq.id); }}
                        disabled={sendMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors ml-auto"
                      >
                        <Send className="w-3 h-3" />
                        Send RFQ
                      </button>
                    )}
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-4">
                      {/* Items needed */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Items Requested</h4>
                        <div className="space-y-1">
                          {rfq.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                              <span className="font-medium">{item.itemName ?? item.itemId}</span>
                              {item.itemSku && (
                                <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{item.itemSku}</span>
                              )}
                              <span className="text-gray-400">×{item.quantityNeeded}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Supplier responses */}
                      {rfq.responses.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Supplier Quotes</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500 dark:text-gray-400">
                                  <th className="text-left pb-1">Supplier</th>
                                  <th className="text-right pb-1">Quoted</th>
                                  <th className="text-right pb-1">Delivery</th>
                                  <th className="text-center pb-1">Status</th>
                                  <th className="pb-1" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {[...rfq.responses]
                                  .sort((a, b) => a.quotedPriceCents - b.quotedPriceCents)
                                  .map((resp) => (
                                    <tr key={resp.id}>
                                      <td className="py-2 font-medium text-gray-900 dark:text-white">
                                        {resp.supplier?.name ?? resp.supplierId}
                                        {resp.quotedPriceCents === best && rfq.responses.length > 1 && (
                                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                            LOWEST
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 text-right text-gray-700 dark:text-gray-300">{fmt(resp.quotedPriceCents)}</td>
                                      <td className="py-2 text-right text-gray-500 dark:text-gray-400">
                                        {resp.deliveryDays != null ? `${resp.deliveryDays}d` : '—'}
                                      </td>
                                      <td className="py-2 text-center">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${responseBadge(resp.status)}`}>
                                          {resp.status}
                                        </span>
                                      </td>
                                      <td className="py-2 text-right">
                                        {rfq.status !== 'AWARDED' && (
                                          <button
                                            onClick={() => awardMut.mutate({ rfqId: rfq.id, rid: resp.id })}
                                            disabled={awardMut.isPending}
                                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                                          >
                                            <Award className="w-3 h-3" />
                                            Award
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {rfq.status !== 'AWARDED' && (
                        <QuoteForm
                          rfqId={rfq.id}
                          suppliers={suppliers}
                          onSaved={() => qc.invalidateQueries({ queryKey: ['rfqs'] })}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Create RFQ tab */}
      {tab === 'create' && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Urgent procurement for next week's stock"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deadline</label>
            <input
              type="date"
              value={formDeadline}
              onChange={(e) => setFormDeadline(e.target.value)}
              className="w-48 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Items *</label>
              <button
                type="button"
                onClick={addItem}
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> Add item
              </button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={item.itemId}
                    onChange={(e) => updateItem(idx, 'itemId', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select item…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}{it.sku ? ` (${it.sku})` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={item.quantityNeeded}
                    onChange={(e) => updateItem(idx, 'quantityNeeded', Number(e.target.value))}
                    className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Qty"
                  />
                  {formItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {items.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                No inventory items found — add items first so they can be requested.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setTab('list')}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || formItems.every((i) => !i.itemId.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create RFQ
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
