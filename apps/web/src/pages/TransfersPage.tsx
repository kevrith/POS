import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  ArrowRightLeft, Plus, CheckCircle, XCircle, Clock, Package,
  ChevronDown, ChevronUp, AlertCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Store {
  id: string;
  name: string;
  storeCode: string;
}

interface Item {
  id: string;
  name: string;
  sku?: string;
  currentStock: number;
}

interface StoreTransfer {
  id: string;
  offlineId: string;
  businessId: string;
  fromStoreId: string;
  toStoreId: string;
  status: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
  initiatedBy: string;
  receivedBy?: string;
  approvedBy?: string;
  notes?: string;
  createdAt: string;
  items: { itemId: string; quantity: number }[];
}

// ─── New Transfer Modal ────────────────────────────────────────────────────────

function NewTransferModal({
  businessId,
  stores,
  currentStoreId,
  onClose,
}: {
  businessId: string;
  stores: Store[];
  currentStoreId: string;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [fromStoreId, setFromStoreId] = useState(currentStoreId);
  const [toStoreId, setToStoreId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{ itemId: string; quantity: number }>>([
    { itemId: '', quantity: 1 },
  ]);

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['items', businessId, fromStoreId],
    queryFn: () => api.get(`/items?businessId=${businessId}&storeId=${fromStoreId}`),
    enabled: !!fromStoreId,
  });

  const mutation = useMutation({
    mutationFn: (data: object) => api.post('/transfers', data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfers', businessId] });
      onClose();
    },
  });

  const addLine = () => setLines((l) => [...l, { itemId: '', quantity: 1 }]);
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: 'itemId' | 'quantity', value: string | number) => {
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [field]: value } : line));
  };

  const handleSubmit = () => {
    const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!fromStoreId || !toStoreId || validLines.length === 0) return;
    mutation.mutate({
      offlineId: crypto.randomUUID(),
      businessId,
      fromStoreId,
      toStoreId,
      initiatedBy: user?.id,
      notes: notes || undefined,
      items: validLines,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            New Stock Transfer
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
        </div>

        {/* From / To */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">From Store</label>
            <select
              value={fromStoreId}
              onChange={(e) => setFromStoreId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.storeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">To Store</label>
            <select
              value={toStoreId}
              onChange={(e) => setToStoreId(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="">— Select destination —</option>
              {stores.filter((s) => s.id !== fromStoreId).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.storeCode})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Items to Transfer</label>
            <button onClick={addLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add item
            </button>
          </div>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {lines.map((line, i) => {
              const selectedItem = items.find((item) => item.id === line.itemId);
              return (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={line.itemId}
                    onChange={(e) => updateLine(i, 'itemId', e.target.value)}
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">— Select item —</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} (stock: {item.currentStock})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={selectedItem?.currentStock ?? 9999}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', Number(e.target.value))}
                    className="w-24 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  {lines.length > 1 && (
                    <button onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Weekly restocking"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        {mutation.isError && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {(mutation.error as Error).message}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !toStoreId || lines.every((l) => !l.itemId)}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transfer Card ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING:   { label: 'Pending',   color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300', icon: Clock },
  APPROVED:  { label: 'Approved',  color: 'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-300',   icon: CheckCircle },
  COMPLETED: { label: 'Completed', color: 'bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-300',  icon: CheckCircle },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300',    icon: XCircle },
  REJECTED:  { label: 'Rejected',  color: 'bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-300',    icon: XCircle },
};

function TransferCard({
  transfer,
  stores,
  onReceive,
  onCancel,
  onApprove,
  onReject,
}: {
  transfer: StoreTransfer;
  stores: Store[];
  onReceive: (id: string) => void;
  onCancel: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[transfer.status];
  const StatusIcon = cfg.icon;
  const fromStore = stores.find((s) => s.id === transfer.fromStoreId);
  const toStore = stores.find((s) => s.id === transfer.toStoreId);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-medium text-gray-900 dark:text-white text-sm">
                {fromStore?.name ?? transfer.fromStoreId}
                <span className="mx-2 text-gray-400">→</span>
                {toStore?.name ?? transfer.toStoreId}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {transfer.items.length} line{transfer.items.length !== 1 ? 's' : ''}
                {transfer.notes && <span className="ml-2 italic">"{transfer.notes}"</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(transfer.createdAt).toLocaleDateString()}
            </span>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Actions for PENDING — approve/reject/cancel */}
        {transfer.status === 'PENDING' && (
          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              onClick={() => onApprove(transfer.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              onClick={() => onReject(transfer.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
            <button
              onClick={() => onCancel(transfer.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
        {/* Actions for APPROVED — receive */}
        {transfer.status === 'APPROVED' && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => onReceive(transfer.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Mark Received
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <div className="space-y-1.5">
            {transfer.items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{item.itemId.slice(0, 8)}…</span>
                <span className="text-gray-900 dark:text-white font-medium">× {item.quantity}</span>
              </div>
            ))}
          </div>
          {transfer.receivedBy && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Received by: {transfer.receivedBy}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransfersPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const currentStoreId = user?.storeId ?? '';
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data: stores = [] } = useQuery<Store[]>({
    queryKey: ['stores', businessId],
    queryFn: () => api.get(`/business/${businessId}/stores`),
    enabled: !!businessId,
  });

  const { data: transfers = [], isLoading } = useQuery<StoreTransfer[]>({
    queryKey: ['transfers', businessId, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ businessId });
      if (statusFilter) params.set('status', statusFilter);
      return api.get(`/transfers?${params}`);
    },
    enabled: !!businessId,
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/transfers/${id}/receive`, { receivedBy: user?.id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transfers', businessId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/transfers/${id}/cancel`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transfers', businessId] }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/transfers/${id}/approve`, { approvedBy: user?.id }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transfers', businessId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/transfers/${id}/reject`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['transfers', businessId] }),
  });

  const pending   = transfers.filter((t) => t.status === 'PENDING').length;
  const completed = transfers.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="w-6 h-6 text-blue-600" />
            Stock Transfers
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Move stock between stores</p>
        </div>
        {stores.length >= 2 && (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Transfer
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending',   value: pending,                 color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
          { label: 'Completed', value: completed,               color: 'text-green-600',  bg: 'bg-green-50  dark:bg-green-900/20'  },
          { label: 'Stores',    value: stores.length,           color: 'text-blue-600',   bg: 'bg-blue-50   dark:bg-blue-900/20'   },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`${bg} rounded-xl p-4`}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold ${color} mt-1`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {['', 'PENDING', 'APPROVED', 'COMPLETED', 'CANCELLED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* List */}
      {stores.length < 2 && (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">No stores to transfer between</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Add a second store in Settings to enable transfers.</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : transfers.length === 0 && stores.length >= 2 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No transfers yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {transfers.map((transfer) => (
            <TransferCard
              key={transfer.id}
              transfer={transfer}
              stores={stores}
              onReceive={(id) => receiveMutation.mutate(id)}
              onCancel={(id) => cancelMutation.mutate(id)}
              onApprove={(id) => approveMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {showNew && (
        <NewTransferModal
          businessId={businessId}
          stores={stores}
          currentStoreId={currentStoreId}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
