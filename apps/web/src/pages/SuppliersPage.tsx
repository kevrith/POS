import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Package, FileText, Truck, ChevronRight, X, Check,
  AlertCircle, Loader2, RefreshCw, ArrowLeft,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact?: string;
  address?: string;
  paymentTerms?: string;
  creditLimitCents?: number;
  outstandingBalanceCents: number;
}

interface POItem {
  id: string;
  itemId: string;
  quantityOrdered: number;
  agreedPriceCents: number;
  item?: { name: string; sku?: string };
}

interface GRNItem {
  id: string;
  poItemId: string;
  quantityReceived: number;
  batchLotNumber?: string;
  expiryDate?: string;
}

interface GRN {
  id: string;
  poId: string;
  receivedAt: string;
  items: GRNItem[];
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  businessId: string;
  supplierId: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  expectedDelivery?: string;
  notes?: string;
  createdAt: string;
  supplier?: { name: string };
  items: POItem[];
  grns: GRN[];
}

interface CatalogItem {
  id: string;
  name: string;
  sku?: string;
  costCents?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<PurchaseOrder['status'], string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-purple-100 text-purple-700',
  PARTIALLY_RECEIVED: 'bg-yellow-100 text-yellow-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

// ─── Create PO Modal ──────────────────────────────────────────────────────────

interface CreatePOModalProps {
  businessId: string;
  storeId: string;
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
}

function CreatePOModal({ businessId, storeId, suppliers, onClose, onSuccess }: CreatePOModalProps) {
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Array<{
    itemId: string; name: string; quantity: number; priceCents: number;
  }>>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [error, setError] = useState('');

  const { data: items = [] } = useQuery<CatalogItem[]>({
    queryKey: ['catalog-items-po', businessId],
    queryFn: () => api.get<CatalogItem[]>(`/catalog/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/suppliers/purchase-orders', {
        businessId,
        supplierId,
        expectedDelivery: expectedDelivery || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({
          itemId: l.itemId,
          quantityOrdered: l.quantity,
          agreedPriceCents: l.priceCents,
        })),
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create PO'),
  });

  const filteredItems = items.filter((i) =>
    i.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    (i.sku ?? '').toLowerCase().includes(itemSearch.toLowerCase()),
  );

  function addLine(item: CatalogItem) {
    if (lines.find((l) => l.itemId === item.id)) return;
    setLines([...lines, { itemId: item.id, name: item.name, quantity: 1, priceCents: item.costCents ?? 0 }]);
    setItemSearch('');
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.priceCents, 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">New Purchase Order</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Delivery</label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes..."
              className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Item Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Add Items</label>
            <input
              type="text"
              placeholder="Search items by name or SKU..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            />
            {itemSearch && filteredItems.length > 0 && (
              <div className="mt-1 border rounded-xl shadow-lg max-h-40 overflow-y-auto bg-white z-10 relative">
                {filteredItems.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addLine(item)}
                    disabled={!!lines.find((l) => l.itemId === item.id)}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                  >
                    <span>{item.name}</span>
                    <span className="text-gray-400 text-xs">{item.sku ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Line Items */}
          {lines.length > 0 && (
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 w-24">Qty</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600 w-36">Price (KES)</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.itemId} className="border-t">
                      <td className="px-4 py-2 font-medium text-gray-800">{line.name}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => setLines(lines.map((l, i) =>
                            i === idx ? { ...l, quantity: Math.max(1, parseInt(e.target.value) || 1) } : l,
                          ))}
                          className="w-full border rounded-lg px-2 py-1 text-center"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={(line.priceCents / 100).toFixed(2)}
                          onChange={(e) => setLines(lines.map((l, i) =>
                            i === idx ? { ...l, priceCents: Math.round(parseFloat(e.target.value || '0') * 100) } : l,
                          ))}
                          className="w-full border rounded-lg px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 font-bold text-gray-700 text-right">Total:</td>
                    <td className="px-3 py-2 font-bold text-blue-600 text-right">{fmt(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!supplierId || lines.length === 0 || create.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {create.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
            Create PO
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GRN Modal ────────────────────────────────────────────────────────────────

interface GRNModalProps {
  po: PurchaseOrder;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function GRNModal({ po, storeId, onClose, onSuccess }: GRNModalProps) {
  const [receiving, setReceiving] = useState(
    po.items.map((item) => ({
      poItemId: item.id,
      name: item.item?.name ?? item.itemId,
      ordered: item.quantityOrdered,
      received: item.quantityOrdered,
      batchLot: '',
      expiry: '',
    })),
  );
  const [error, setError] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/suppliers/purchase-orders/${po.id}/grn`, {
        storeId,
        items: receiving.map((r) => ({
          poItemId: r.poItemId,
          quantityReceived: r.received,
          batchLotNumber: r.batchLot || undefined,
          expiryDate: r.expiry || undefined,
        })),
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to record GRN'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Record Goods Received</h2>
            <p className="text-sm text-gray-500">PO: {po.poNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <p className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
            Enter quantities received. Stock levels will be updated automatically upon confirmation.
          </p>

          {receiving.map((r, idx) => (
            <div key={r.poItemId} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">{r.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  Ordered: {r.ordered}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Qty Received *</label>
                  <input
                    type="number"
                    min={0}
                    value={r.received}
                    onChange={(e) => setReceiving(receiving.map((x, i) =>
                      i === idx ? { ...x, received: Math.max(0, parseInt(e.target.value) || 0) } : x,
                    ))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Batch / Lot No.</label>
                  <input
                    type="text"
                    value={r.batchLot}
                    onChange={(e) => setReceiving(receiving.map((x, i) =>
                      i === idx ? { ...x, batchLot: e.target.value } : x,
                    ))}
                    placeholder="e.g. LOT-2024-01"
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={r.expiry}
                    onChange={(e) => setReceiving(receiving.map((x, i) =>
                      i === idx ? { ...x, expiry: e.target.value } : x,
                    ))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {r.received < r.ordered && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Receiving {r.ordered - r.received} fewer than ordered — PO will be marked Partially Received
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submit.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
            Confirm Receipt
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PO Detail ────────────────────────────────────────────────────────────────

interface PODetailProps {
  po: PurchaseOrder;
  storeId: string;
  onBack: () => void;
  onRefresh: () => void;
}

function PODetail({ po, storeId, onBack, onRefresh }: PODetailProps) {
  const qc = useQueryClient();
  const [showGRN, setShowGRN] = useState(false);

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/suppliers/purchase-orders/${po.id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onRefresh();
    },
  });

  const total = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-gray-50">
        <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-800">{po.poNumber}</h2>
          <p className="text-sm text-gray-500">
            {po.supplier?.name} • {new Date(po.createdAt).toLocaleDateString('en-KE')}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[po.status]}`}>
          {po.status.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Expected Delivery</p>
            <p className="font-semibold text-gray-800">
              {po.expectedDelivery ? new Date(po.expectedDelivery).toLocaleDateString('en-KE') : 'Not set'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Value</p>
            <p className="font-bold text-blue-600 text-lg">{fmt(total)}</p>
          </div>
        </div>

        {po.notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Notes</p>
            <p className="text-sm text-amber-800">{po.notes}</p>
          </div>
        )}

        {/* Items table */}
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">Order Items ({po.items.length})</h3>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                  <th className="text-center px-3 py-2 font-medium text-gray-600">Qty</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Unit Price</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {po.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {item.item?.name ?? item.itemId}
                      {item.item?.sku && <span className="ml-2 text-xs text-gray-400">{item.item.sku}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center text-gray-700">{item.quantityOrdered}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{fmt(item.agreedPriceCents)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                      {fmt(item.quantityOrdered * item.agreedPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={3} className="px-4 py-2 font-bold text-right text-gray-700">Total</td>
                  <td className="px-4 py-2 font-bold text-blue-600 text-right">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* GRNs */}
        {po.grns.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4 text-green-600" />
              Goods Received Notes ({po.grns.length})
            </h3>
            <div className="space-y-3">
              {po.grns.map((grn) => (
                <div key={grn.id} className="border border-green-200 rounded-xl p-4 bg-green-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-green-800">
                      Received on {new Date(grn.receivedAt).toLocaleDateString('en-KE')}
                    </span>
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="space-y-1">
                    {grn.items.map((gi) => {
                      const poItem = po.items.find((p) => p.id === gi.poItemId);
                      return (
                        <div key={gi.id} className="flex items-center justify-between text-sm text-green-700">
                          <span>{poItem?.item?.name ?? gi.poItemId}</span>
                          <div className="flex items-center gap-3">
                            {gi.batchLotNumber && (
                              <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                                {gi.batchLotNumber}
                              </span>
                            )}
                            <span className="font-semibold">{gi.quantityReceived} received</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t px-6 py-4 flex gap-3">
        {po.status === 'DRAFT' && (
          <button
            onClick={() => updateStatus.mutate('SUBMITTED')}
            disabled={updateStatus.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit PO
          </button>
        )}
        {po.status === 'SUBMITTED' && (
          <>
            <button
              onClick={() => updateStatus.mutate('APPROVED')}
              disabled={updateStatus.isPending}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Approve
            </button>
            <button
              onClick={() => updateStatus.mutate('CANCELLED')}
              disabled={updateStatus.isPending}
              className="flex-1 py-2.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-xl font-semibold"
            >
              Cancel
            </button>
          </>
        )}
        {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && (
          <button
            onClick={() => setShowGRN(true)}
            className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            <Truck className="w-4 h-4" />
            Record Goods Received (GRN)
          </button>
        )}
      </div>

      {showGRN && (
        <GRNModal
          po={po}
          storeId={storeId}
          onClose={() => setShowGRN(false)}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
            onRefresh();
            setShowGRN(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'suppliers' | 'purchase-orders';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('suppliers');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poStatusFilter, setPOStatusFilter] = useState('ALL');
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact: '', address: '', paymentTerms: '', creditLimit: '',
  });
  const [formError, setFormError] = useState('');

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const { data: suppliers = [], isLoading: suppliersLoading, refetch: refetchSuppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers', businessId],
    queryFn: () => api.get<Supplier[]>(`/suppliers?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: purchaseOrders = [], isLoading: posLoading, refetch: refetchPOs } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', businessId],
    queryFn: () => api.get<PurchaseOrder[]>(`/suppliers/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId && tab === 'purchase-orders',
  });

  const createSupplier = useMutation({
    mutationFn: () =>
      api.post('/suppliers', {
        businessId,
        name: supplierForm.name,
        contact: supplierForm.contact || undefined,
        address: supplierForm.address || undefined,
        paymentTerms: supplierForm.paymentTerms || undefined,
        creditLimitCents: supplierForm.creditLimit
          ? Math.round(parseFloat(supplierForm.creditLimit) * 100)
          : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      setShowAddSupplier(false);
      setSupplierForm({ name: '', contact: '', address: '', paymentTerms: '', creditLimit: '' });
      setFormError('');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Failed'),
  });

  const totalOutstanding = suppliers.reduce((s, sup) => s + sup.outstandingBalanceCents, 0);
  const openPOs = purchaseOrders.filter((p) => ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(p.status)).length;
  const pendingGRN = purchaseOrders.filter((p) => p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED').length;
  const filteredPOs = poStatusFilter === 'ALL' ? purchaseOrders :
    purchaseOrders.filter((p) => p.status === poStatusFilter);

  if (selectedPO) {
    const fresh = purchaseOrders.find((p) => p.id === selectedPO.id) ?? selectedPO;
    return (
      <div className="h-full bg-gray-50">
        <PODetail po={fresh} storeId={storeId} onBack={() => setSelectedPO(null)} onRefresh={() => void refetchPOs()} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Suppliers & Procurement</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {suppliers.length} suppliers • {fmt(totalOutstanding)} outstanding
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void refetchSuppliers(); void refetchPOs(); }}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {tab === 'suppliers' ? (
              <button
                onClick={() => setShowAddSupplier(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Supplier
              </button>
            ) : (
              <button
                onClick={() => setShowCreatePO(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                New PO
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {([
            { id: 'suppliers' as const, label: 'Suppliers', Icon: Package },
            { id: 'purchase-orders' as const, label: 'Purchase Orders', Icon: FileText },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase">Total Suppliers</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase">Outstanding Balance</p>
          <p className={`text-2xl font-bold mt-1 ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {fmt(totalOutstanding)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase">Open POs</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{openPOs}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500 font-medium uppercase">Pending Receipt</p>
          <p className="text-2xl font-bold text-orange-500 mt-1">{pendingGRN}</p>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">

        {/* ── Suppliers Tab ── */}
        {tab === 'suppliers' && (
          <>
            {showAddSupplier && (
              <div className="bg-white rounded-2xl border shadow-sm mb-4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800">New Supplier</h2>
                  <button onClick={() => { setShowAddSupplier(false); setFormError(''); }} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                {formError && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4" /> {formError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      value={supplierForm.name}
                      onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                      placeholder="Supplier name"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                    <input
                      value={supplierForm.contact}
                      onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })}
                      placeholder="Phone / email"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={supplierForm.paymentTerms}
                      onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select...</option>
                      <option value="CASH">Cash on Delivery</option>
                      <option value="NET_7">Net 7 days</option>
                      <option value="NET_14">Net 14 days</option>
                      <option value="NET_30">Net 30 days</option>
                      <option value="NET_60">Net 60 days</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit (KES)</label>
                    <input
                      type="number"
                      min={0}
                      value={supplierForm.creditLimit}
                      onChange={(e) => setSupplierForm({ ...supplierForm, creditLimit: e.target.value })}
                      placeholder="0"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      value={supplierForm.address}
                      onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                      placeholder="Physical address"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => createSupplier.mutate()}
                    disabled={!supplierForm.name || createSupplier.isPending}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-2"
                  >
                    {createSupplier.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setShowAddSupplier(false); setFormError(''); }}
                    className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {suppliersLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-20">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No suppliers yet</p>
                <button
                  onClick={() => setShowAddSupplier(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
                >
                  Add First Supplier
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Supplier</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Terms</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr
                        key={s.id}
                        className="border-t hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => { setTab('purchase-orders'); }}
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{s.name}</div>
                          {s.address && <div className="text-xs text-gray-400 mt-0.5">{s.address}</div>}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden sm:table-cell">{s.contact ?? '—'}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{s.paymentTerms ?? '—'}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold text-sm ${s.outstandingBalanceCents > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {fmt(s.outstandingBalanceCents)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Purchase Orders Tab ── */}
        {tab === 'purchase-orders' && (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              {(['ALL', 'DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setPOStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    poStatusFilter === s
                      ? 'bg-gray-800 text-white'
                      : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {s === 'ALL' ? `All (${purchaseOrders.length})` : s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {posLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : filteredPOs.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No purchase orders</p>
                <button
                  onClick={() => setShowCreatePO(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
                >
                  Create First PO
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">PO Number</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Supplier</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Expected</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Value</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPOs.map((po) => {
                      const poTotal = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);
                      return (
                        <tr
                          key={po.id}
                          className="border-t hover:bg-gray-50 transition-colors cursor-pointer"
                          onClick={() => setSelectedPO(po)}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-800">{po.poNumber}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {new Date(po.createdAt).toLocaleDateString('en-KE')}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-700 hidden sm:table-cell">
                            {po.supplier?.name ?? '—'}
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[po.status]}`}>
                              {po.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">
                            {po.expectedDelivery
                              ? new Date(po.expectedDelivery).toLocaleDateString('en-KE')
                              : '—'}
                          </td>
                          <td className="px-4 py-4 text-right font-semibold text-gray-800">{fmt(poTotal)}</td>
                          <td className="px-4 py-4">
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showCreatePO && (
        <CreatePOModal
          businessId={businessId}
          storeId={storeId}
          suppliers={suppliers}
          onClose={() => setShowCreatePO(false)}
          onSuccess={() => void refetchPOs()}
        />
      )}
    </div>
  );
}
