import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package, AlertTriangle, Clock, RotateCcw, History, X,
  RefreshCw, CheckCircle, XCircle, Loader2, Plus, Undo2, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { useDialog } from '../components/Dialog';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ─────────────────────────────────────────────────────────────────

interface Batch {
  id: string;
  itemId: string;
  storeId: string;
  lotNumber: string;
  manufacturingDate?: string;
  expiryDate?: string;
  supplierId?: string;
  quantityReceived: number;
  quantityRemaining: number;
  status: string;
  createdAt: string;
  item: { name: string; unit?: string; costPriceCents?: number | null };
}

interface Bucket { lots: number; units: number; costCents: number }
type BucketName = 'expired' | 'within30' | 'within60' | 'within90' | 'later' | 'noExpiry' | 'recalled' | 'total';
type ExpirySummary = Record<BucketName, Bucket>;

interface BatchMovement {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  sale?: { receiptNumber?: string };
}

interface BatchHistoryDetail {
  id: string;
  lotNumber: string;
  quantityReceived: number;
  quantityRemaining: number;
  expiryDate?: string;
  status: string;
  item: { name: string };
  movements: BatchMovement[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const now = new Date();

function daysUntilExpiry(expiry?: string): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - now.getTime()) / 86400000);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getExpiryBadge(expiryDate?: string) {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return null;
  if (days <= 0) return { label: 'EXPIRED', cls: 'bg-red-100 text-red-700' };
  if (days <= 7) return { label: `${days}d`, cls: 'bg-red-100 text-red-700' };
  if (days <= 30) return { label: `${days}d`, cls: 'bg-yellow-100 text-yellow-700' };
  return { label: `${days}d`, cls: 'bg-green-100 text-green-700' };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-700';
    case 'RECALLED': return 'bg-red-100 text-red-700';
    case 'EXPIRED': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// ─── Recall Confirm Modal ──────────────────────────────────────────────────

interface RecallResult {
  batch: Batch;
  affectedSales: Array<{ receiptNumber?: string }>;
}

interface RecallModalProps {
  batch: Batch;
  businessId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function RecallModal({ batch, businessId, onClose, onSuccess }: RecallModalProps) {
  const [result, setResult] = useState<RecallResult | null>(null);

  const recall = useMutation({
    mutationFn: () =>
      api.post<RecallResult>(`/businesses/${businessId}/batch/${batch.id}/recall`, {}),
    onSuccess: (data) => {
      setResult(data);
      onSuccess();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {result ? 'Recall Complete' : 'Confirm Recall'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            <>
              <p className="text-gray-700 mb-3">
                You are about to recall batch <span className="font-mono font-bold">{batch.lotNumber}</span> for{' '}
                <span className="font-semibold">{batch.item.name}</span>.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
                <p className="font-semibold mb-1">This will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Mark the batch as RECALLED</li>
                  <li>Show all affected sales receipts</li>
                  <li>Remaining qty: {batch.quantityRemaining} units</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
                  Cancel
                </button>
                <button
                  onClick={() => recall.mutate()}
                  disabled={recall.isPending}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {recall.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Confirm Recall
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 p-3 bg-green-50 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Batch Recalled Successfully</p>
                  <p className="text-sm text-green-600">Lot: {batch.lotNumber}</p>
                </div>
              </div>
              {result.affectedSales.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-700 mb-2">
                    {result.affectedSales.length} affected sale(s):
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {result.affectedSales.map((s, i) => (
                      <div key={i} className="text-sm text-gray-600 font-mono bg-gray-50 rounded px-3 py-1">
                        {s.receiptNumber ?? 'No receipt'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.affectedSales.length === 0 && (
                <p className="text-sm text-gray-500">No sales were affected by this batch.</p>
              )}
              <button onClick={onClose} className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Batch History Modal ───────────────────────────────────────────────────

interface HistoryModalProps {
  batchId: string;
  businessId: string;
  onClose: () => void;
}

function HistoryModal({ batchId, businessId, onClose }: HistoryModalProps) {
  const { data, isLoading } = useQuery<BatchHistoryDetail>({
    queryKey: ['batch-history', batchId],
    queryFn: () => api.get<BatchHistoryDetail>(`/businesses/${businessId}/batch/${batchId}/history`),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" />
            Batch History
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : !data ? (
            <p className="text-center text-gray-400 py-8">No data found</p>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Item</p>
                    <p className="font-semibold text-gray-800">{data.item.name}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lot #</p>
                    <p className="font-mono font-semibold text-gray-800">{data.lotNumber}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Received</p>
                    <p className="font-semibold text-gray-800">{data.quantityReceived} units</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Remaining</p>
                    <p className="font-semibold text-gray-800">{data.quantityRemaining} units</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Expiry</p>
                    <p className="font-semibold text-gray-800">{fmtDate(data.expiryDate)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Status</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusBadge(data.status)}`}>
                      {data.status}
                    </span>
                  </div>
                </div>
              </div>

              <h3 className="font-semibold text-gray-700 mb-3">Movement History</h3>
              {data.movements.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No movements recorded</p>
              ) : (
                <div className="space-y-2">
                  {data.movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                      <div>
                        <span className="text-sm font-semibold text-gray-800">{m.type}</span>
                        {m.sale?.receiptNumber && (
                          <span className="ml-2 text-xs text-gray-500 font-mono">#{m.sale.receiptNumber}</span>
                        )}
                        <p className="text-xs text-gray-400">{fmtDate(m.createdAt)}</p>
                      </div>
                      <span className={`font-bold text-sm ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Batch Modal ────────────────────────────────────────────────────────

interface AddBatchModalProps {
  businessId: string;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddBatchModal({ businessId, storeId, onClose, onSuccess }: AddBatchModalProps) {
  const [form, setForm] = useState({
    itemSearch: '',
    itemId: '',
    lotNumber: '',
    quantityReceived: '',
    expiryDate: '',
    manufacturingDate: '',
  });
  const [error, setError] = useState('');

  const { data: searchItems = [] } = useQuery<Array<{ id: string; name: string; trackBatches: boolean }>>({
    queryKey: ['items-batch-search', businessId, storeId, form.itemSearch],
    queryFn: () =>
      api.get<Array<{ id: string; name: string; trackBatches: boolean }>>(
        `/items?businessId=${businessId}&storeId=${storeId}&search=${encodeURIComponent(form.itemSearch)}`,
      ),
    enabled: !!businessId && !!storeId && form.itemSearch.length >= 2,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/businesses/${businessId}/batch`, {
        itemId: form.itemId,
        storeId,
        lotNumber: form.lotNumber,
        quantityReceived: Math.round(parseFloat(form.quantityReceived) * 1000) / 1000,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
        manufacturingDate: form.manufacturingDate ? new Date(form.manufacturingDate).toISOString() : undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create batch'),
  });

  const batchableItems = searchItems.filter((i) => i.trackBatches);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Batch</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="w-4 h-4" /> {error}
            </div>
          )}

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
            {form.itemId ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                <span className="text-sm font-semibold text-blue-800">
                  {batchableItems.find((i) => i.id === form.itemId)?.name ?? form.itemSearch}
                </span>
                <button onClick={() => setForm({ ...form, itemId: '', itemSearch: '' })} className="text-blue-400 hover:text-blue-600" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={form.itemSearch}
                  onChange={(e) => setForm({ ...form, itemSearch: e.target.value, itemId: '' })}
                  placeholder="Search item by name..."
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                {batchableItems.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border rounded-xl mt-1 shadow-lg max-h-40 overflow-y-auto">
                    {batchableItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setForm({ ...form, itemId: item.id, itemSearch: item.name })}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lot / Batch Number *</label>
            <input
              type="text"
              value={form.lotNumber}
              onChange={(e) => setForm({ ...form, lotNumber: e.target.value })}
              placeholder="e.g. LOT-2024-001"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Received *</label>
            <input
              type="number"
              min={0.001}
              step="any"
              value={form.quantityReceived}
              onChange={(e) => setForm({ ...form, quantityReceived: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Date</label>
              <input
                type="date"
                value={form.manufacturingDate}
                onChange={(e) => setForm({ ...form, manufacturingDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" aria-label="Date" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" aria-label="Date" />
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!form.itemId || !form.lotNumber || !form.quantityReceived || create.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Batch
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Return to supplier ────────────────────────────────────────────────────

const RETURN_REASONS = ['Expired', 'Near expiry, supplier takes it back', 'Damaged', 'Recalled by the manufacturer', 'Wrong item delivered'];

/** Send what is left of a lot back to its supplier: the units leave this lot and the store, and a return note is made. */
function ReturnModal({ batch, businessId, onClose, onDone }: { batch: Batch; businessId: string; onClose: () => void; onDone: () => void }) {
  const { data: suppliers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['suppliers', businessId],
    queryFn: () => api.get(`/suppliers?businessId=${businessId}`),
  });
  const [supplierId, setSupplierId] = useState(batch.supplierId ?? '');
  const [qty, setQty] = useState(String(batch.quantityRemaining));
  const [reason, setReason] = useState(batch.status === 'RECALLED' ? RETURN_REASONS[3] : batch.expiryDate && new Date(batch.expiryDate) <= new Date() ? RETURN_REASONS[0] : RETURN_REASONS[1]);
  const [note, setNote] = useState('');
  const quantity = Number(qty);
  const bad = !(quantity > 0) || quantity > batch.quantityRemaining;
  const save = useMutation({
    mutationFn: () => api.post<{ returnNumber: string }>('/suppliers/returns', {
      businessId, supplierId, storeId: batch.storeId, reason, notes: note.trim() || undefined,
      items: [{ itemId: batch.itemId, quantity, batchId: batch.id, unitCostCents: batch.item.costPriceCents ?? 0, reason: `Lot ${batch.lotNumber}` }],
    }),
    onSuccess: (r) => { toast.success(`Return ${r.returnNumber} made. ${quantity} left the stock.`); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Return to supplier" className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-start justify-between px-6 py-4 border-b dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">Return to supplier</h2>
            <p className="text-sm text-gray-500">{batch.item.name} · lot {batch.lotNumber} · {batch.quantityRemaining} left</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <form className="p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div>
            <label htmlFor="ret-supplier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Supplier</label>
            <select id="ret-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600">
              <option value="">Choose a supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ret-qty" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
            <input id="ret-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
            {quantity > batch.quantityRemaining && <p className="text-xs text-red-600 mt-1">This lot has only {batch.quantityRemaining} left.</p>}
          </div>
          <div>
            <label htmlFor="ret-reason" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason</label>
            <select id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600">
              {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ret-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note (optional)</label>
            <input id="ret-note" value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600" />
          </div>
          <p className="text-xs text-gray-500">Worth {formatKES(Math.round((Number.isFinite(quantity) ? quantity : 0) * (batch.item.costPriceCents ?? 0)))} at cost. The units leave your stock now; cancel the return under Suppliers if it does not go ahead.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={!supplierId || bad || save.isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{save.isPending ? 'Returning…' : 'Return stock'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

type Filter = 'all' | 'expiring' | 'expired' | 'recalled';

export default function BatchManagementPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const [filter, setFilter] = useState<Filter>('all');
  const [recallBatch, setRecallBatch] = useState<Batch | null>(null);
  const [historyBatchId, setHistoryBatchId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [returning, setReturning] = useState<Batch | null>(null);
  const { confirm } = useDialog();

  const { data: summary } = useQuery<ExpirySummary>({
    queryKey: ['batches-summary', businessId],
    queryFn: () => api.get<ExpirySummary>(`/businesses/${businessId}/batch/expiry-summary`),
    enabled: !!businessId,
  });
  const writeOff = useMutation({
    mutationFn: (b: Batch) => api.patch(`/businesses/${businessId}/batch/${b.id}/write-off`, { authorizedBy: user?.name ?? 'Manager' }),
    onSuccess: () => { toast.success('Written off'); void qc.invalidateQueries({ queryKey: ['batches'] }); void qc.invalidateQueries({ queryKey: ['batches-expiring'] }); void qc.invalidateQueries({ queryKey: ['batches-summary'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const refreshAll = () => { void qc.invalidateQueries({ queryKey: ['batches'] }); void qc.invalidateQueries({ queryKey: ['batches-expiring'] }); void qc.invalidateQueries({ queryKey: ['batches-summary'] }); };

  const { data: batches = [], isLoading, refetch } = useQuery<Batch[]>({
    queryKey: ['batches', businessId],
    queryFn: () => api.get<Batch[]>(`/businesses/${businessId}/batch`),
    enabled: !!businessId,
  });

  const { data: expiringBatches = [] } = useQuery<Batch[]>({
    queryKey: ['batches-expiring', businessId, expiryDays],
    queryFn: () =>
      api.get<Batch[]>(`/businesses/${businessId}/batch/expiring?days=${expiryDays}`),
    enabled: !!businessId && filter === 'expiring',
  });
  const hasStock = (b: Batch) => b.quantityRemaining > 0;

  const nowTs = now.getTime();
  const filtered = (() => {
    if (filter === 'expiring') return expiringBatches;
    if (filter === 'expired')
      return batches.filter((b) => hasStock(b) && b.status !== 'WRITTEN_OFF' && b.expiryDate && new Date(b.expiryDate).getTime() <= nowTs);
    if (filter === 'recalled') return batches.filter((b) => b.status === 'RECALLED');
    return batches;
  })();

  const activeBatches = batches.filter((b) => b.status === 'ACTIVE');
  const recalledCount = batches.filter((b) => b.status === 'RECALLED').length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Batch Management</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {summary ? `${summary.total.lots} ${summary.total.lots === 1 ? 'lot' : 'lots'} with stock, worth ${formatKES(summary.total.costCents)} at cost` : `${batches.length} total batches · ${activeBatches.length} active`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refetch()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" aria-label="Refresh">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Batch
            </button>
          </div>
        </div>
      </div>

      {/* What is on the shelf out of date or about to be, and what it cost */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-6 pb-0">
        {([
          { id: 'expired', label: 'Expired', tone: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/20', show: () => { setFilter('expired'); } },
          { id: 'within30', label: 'Within 30 days', tone: 'text-amber-700', bg: 'bg-amber-50 dark:bg-amber-900/20', show: () => { setFilter('expiring'); setExpiryDays(30); } },
          { id: 'within60', label: '31 to 60 days', tone: 'text-yellow-700', bg: 'bg-yellow-50 dark:bg-yellow-900/20', show: () => { setFilter('expiring'); setExpiryDays(60); } },
          { id: 'within90', label: '61 to 90 days', tone: 'text-blue-700', bg: 'bg-blue-50 dark:bg-blue-900/20', show: () => { setFilter('expiring'); setExpiryDays(90); } },
          { id: 'recalled', label: 'Recalled, to send back', tone: 'text-red-700', bg: 'bg-red-50 dark:bg-red-900/20', show: () => { setFilter('recalled'); } },
        ] as const).map((t) => (
          <button key={t.id} type="button" onClick={t.show} className={`${t.bg} rounded-xl p-4 text-left hover:ring-2 hover:ring-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500`}>
            <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 uppercase mb-1">{t.label}</span>
            <span className={`block text-xl font-bold tabular-nums ${t.tone}`}>{formatKES(summary?.[t.id].costCents ?? 0)}</span>
            <span className="block text-xs text-gray-500">{summary?.[t.id].lots ?? 0} {(summary?.[t.id].lots ?? 0) === 1 ? 'lot' : 'lots'} · {summary?.[t.id].units ?? 0} units at cost</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-4">
        {([
          { id: 'all', label: 'All Batches', icon: Package },
          { id: 'expiring', label: 'Expiring Soon', icon: Clock },
          { id: 'expired', label: 'Expired', icon: AlertTriangle },
          { id: 'recalled', label: 'Recalled', icon: RotateCcw },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === id
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {id === 'recalled' && recalledCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {recalledCount}
              </span>
            )}
          </button>
        ))}

        {filter === 'expiring' && (
          <div className="ml-auto flex items-center gap-2">
            <label className="text-sm text-gray-500">Within</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(Number(e.target.value))}
              className="border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:border-gray-700">
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-16 h-16 mx-auto text-gray-200 dark:text-gray-700 mb-4" />
            <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">No batches found</p>
            <p className="text-sm text-gray-400 mt-1">
              {filter !== 'all' ? 'No batches match this filter.' : 'Add your first batch to get started.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b dark:border-gray-700">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Lot #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Expiry</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Remaining</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((batch) => {
                  const expiryBadge = getExpiryBadge(batch.expiryDate);
                  const pctUsed = batch.quantityReceived > 0
                    ? Math.round(((batch.quantityReceived - batch.quantityRemaining) / batch.quantityReceived) * 100)
                    : 0;

                  return (
                    <tr key={batch.id} className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-gray-800 dark:text-white">{batch.item.name}</p>
                        {batch.item.unit && (
                          <p className="text-xs text-gray-400">{batch.item.unit}</p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{batch.lotNumber}</span>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{fmtDate(batch.expiryDate)}</p>
                        {expiryBadge && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${expiryBadge.cls} mt-0.5 inline-block`}>
                            {expiryBadge.label} left
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="text-center">
                          <p className="font-bold text-gray-800 dark:text-white text-sm">
                            {batch.quantityRemaining}/{batch.quantityReceived}
                          </p>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1">
                            <div
                              className="h-1.5 bg-blue-500 rounded-full"
                              style={{ width: `${pctUsed}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{pctUsed}% used</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${getStatusBadge(batch.status)}`}>
                          {batch.status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setHistoryBatchId(batch.id)}
                            title="View History"
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          {hasStock(batch) && (batch.status === 'ACTIVE' || batch.status === 'RECALLED') && (
                            <button
                              onClick={() => setReturning(batch)}
                              title="Return to supplier"
                              aria-label={`Return lot ${batch.lotNumber} to supplier`}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          )}
                          {hasStock(batch) && batch.status === 'ACTIVE' && (
                            <button
                              onClick={async () => {
                                const ok = await confirm({ title: 'Write off this lot', message: `Write off the ${batch.quantityRemaining} left of ${batch.item.name}, lot ${batch.lotNumber}? It is recorded as a loss at cost and cannot be undone.`, confirmLabel: 'Write off', variant: 'danger' });
                                if (ok) writeOff.mutate(batch);
                              }}
                              title="Write off"
                              aria-label={`Write off lot ${batch.lotNumber}`}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {batch.status === 'ACTIVE' && (
                            <button
                              onClick={() => setRecallBatch(batch)}
                              title="Recall Batch"
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {recallBatch && (
        <RecallModal
          batch={recallBatch}
          businessId={businessId}
          onClose={() => setRecallBatch(null)}
          onSuccess={refreshAll}
        />
      )}

      {returning && (
        <ReturnModal batch={returning} businessId={businessId} onClose={() => setReturning(null)} onDone={refreshAll} />
      )}

      {historyBatchId && (
        <HistoryModal
          batchId={historyBatchId}
          businessId={businessId}
          onClose={() => setHistoryBatchId(null)}
        />
      )}

      {showAddModal && (
        <AddBatchModal
          businessId={businessId}
          storeId={storeId}
          onClose={() => setShowAddModal(false)}
          onSuccess={refreshAll}
        />
      )}
    </div>
  );
}
