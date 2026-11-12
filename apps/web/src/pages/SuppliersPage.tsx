import { useState } from 'react';
import { useDialog } from '../components/Dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Package, FileText, Truck, ChevronRight, X, Check,
  AlertCircle, Loader2, RefreshCw, ArrowLeft, Mail, Pencil,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { printHtml } from '../lib/printHtml';
import { escapeHtml } from '@pos/print-core';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
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
  invoiceNumber?: string;
  invoicedAt?: string;
  supplier?: { name: string; contact?: string };
  items: POItem[];
  grns: GRN[];
}

interface CatalogItem {
  id: string;
  name: string;
  sku?: string;
  costPriceCents?: number;
}

interface SupplierReturnItem {
  id: string;
  itemId: string;
  quantity: number;
  unitCostCents: number;
  totalCents: number;
  reason?: string;
  lotNumber?: string | null;
  item?: { name: string; sku?: string };
}

interface SupplierReturn {
  id: string;
  returnNumber: string;
  supplierId: string;
  purchaseOrderId?: string;
  status: string;
  reason: string;
  totalCents: number;
  notes?: string;
  createdAt: string;
  supplier?: { name: string };
  items: SupplierReturnItem[];
}

interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  purchaseOrderId?: string;
  invoiceDateStr: string;
  totalCents: number;
  status: string;
  notes?: string;
  createdAt: string;
  supplier?: { name: string };
}

interface ThreeWayMatchResult {
  po: { id: string; orderNumber: string; totalCents: number };
  invoice: SupplierInvoice | null;
  lineMatches: Array<{ itemId: string; itemName: string; orderedQty: number; receivedQty: number; status: string }>;
  valueMatch: boolean | null;
  overallStatus: 'MATCHED' | 'DISCREPANCY';
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
    queryFn: () => api.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
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
    setLines([...lines, { itemId: item.id, name: item.name, quantity: 1, priceCents: item.costPriceCents ?? 0 }]);
    setItemSearch('');
  }

  const total = lines.reduce((s, l) => s + l.quantity * l.priceCents, 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">New Purchase Order</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
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
                className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500">
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
                className="w-full px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500" aria-label="Date" />
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
                          className="text-red-400 hover:text-red-600" aria-label="Close">
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
    po.items.map((item) => {
      // What is still to come: the order less what earlier receipts brought in.
      const earlier = (po.grns ?? []).flatMap((g) => g.items).filter((g) => g.poItemId === item.id).reduce((sum, g) => sum + g.quantityReceived, 0);
      const outstanding = Math.max(0, Math.round((item.quantityOrdered - earlier) * 1000) / 1000);
      return { poItemId: item.id, name: item.item?.name ?? item.itemId, ordered: outstanding, earlier, received: outstanding, batchLot: '', expiry: '' };
    }),
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
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
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
            Enter quantities received. Stock levels will be updated automatically upon confirmation. For stock tracked by lot (medicines and other batch items) the lot number is needed, and medicines also need the expiry date from the pack: the lot is recorded with the stock.
          </p>

          {receiving.map((r, idx) => (
            <div key={r.poItemId} className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-800">{r.name}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  Still to come: {r.ordered}{r.earlier > 0 ? ` (${r.earlier} already received)` : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Qty Received *</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={r.received}
                    onChange={(e) => setReceiving(receiving.map((x, i) =>
                      i === idx ? { ...x, received: Math.max(0, parseFloat(e.target.value) || 0) } : x,
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
                    className="w-full border rounded-lg px-3 py-2 text-sm" aria-label="Date" />
                </div>
              </div>
              {r.received < r.ordered && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Receiving {Math.round((r.ordered - r.received) * 1000) / 1000} fewer than still expected — PO will be marked Partially Received
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
  const pharmacist = useAuthStore((s) => s.user?.role) === 'PHARMACIST';
  const { confirm } = useDialog();
  const [showGRN, setShowGRN] = useState(false);
  const [showEmailPO, setShowEmailPO] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState(po.supplier?.contact ?? '');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState('');
  const [emailResult, setEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  const emailPO = useMutation({
    mutationFn: () => api.post(`/suppliers/purchase-orders/${po.id}/email`, { recipientEmail: emailRecipient }),
    onSuccess: (res: any) => {
      setEmailResult({ success: true, message: res.message ?? 'PO sent!' });
      setTimeout(() => { setShowEmailPO(false); setEmailResult(null); }, 3000);
    },
    onError: (e: any) => setEmailResult({ success: false, message: e.message }),
  });

  const printPOMutation = useMutation({
    mutationFn: () => api.get<{ text: string }>(`/suppliers/purchase-orders/${po.id}/print-text`),
    onSuccess: (data: any) => {
      printHtml(`<pre style="font-family:monospace;font-size:12px;padding:20px">${escapeHtml(data.text)}</pre>`);
    },
  });

  const closePOMutation = useMutation({
    mutationFn: () => api.post(`/suppliers/purchase-orders/${po.id}/close`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onRefresh();
    },
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) =>
      api.patch(`/suppliers/purchase-orders/${po.id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      onRefresh();
    },
  });

  const invoicePO = useMutation({
    mutationFn: (invoiceNumber: string) =>
      api.patch(`/suppliers/purchase-orders/${po.id}/invoice`, { invoiceNumber }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowInvoiceModal(false);
      setInvoiceNumberInput('');
      onRefresh();
    },
  });

  const total = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-gray-50">
        <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-lg" aria-label="Back">
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
          {po.invoiceNumber && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 col-span-2">
              <p className="text-xs text-green-600 uppercase tracking-wider mb-1 font-medium">Supplier Invoice</p>
              <p className="font-mono font-semibold text-gray-800">{po.invoiceNumber}</p>
              {po.invoicedAt && (
                <p className="text-xs text-gray-500 mt-0.5">Recorded {new Date(po.invoicedAt).toLocaleDateString('en-KE')}</p>
              )}
            </div>
          )}
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
        {!pharmacist && po.status === 'DRAFT' && (
          <button
            onClick={() => updateStatus.mutate('SUBMITTED')}
            disabled={updateStatus.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
          >
            {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit PO
          </button>
        )}
        {!pharmacist && po.status === 'SUBMITTED' && (
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

      {/* Invoice generation — for received POs */}
      {!pharmacist && (po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') && !po.invoiceNumber && (
        <div className="px-6 pb-2">
          <button
            onClick={() => setShowInvoiceModal(true)}
            className="w-full py-2 border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-xl text-sm font-medium hover:bg-indigo-100 flex items-center justify-center gap-2"
          >
            <FileText className="w-4 h-4" />
            Generate Invoice
          </button>
        </div>
      )}

      {/* Email PO button — always visible */}
      <div className="px-6 pb-2">
        <button
          onClick={() => setShowEmailPO(true)}
          className="w-full py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <Mail className="w-4 h-4" />
          Email PO to Supplier
        </button>
      </div>

      {/* Print PO + Force Close — always visible */}
      <div className="px-6 pb-4 flex gap-2">
        {!pharmacist && po.status === 'PARTIALLY_RECEIVED' && (
          <button
            onClick={async () => { const ok = await confirm({ title: 'Close Purchase Order', message: 'Mark this PO as fully received? This cannot be undone.', variant: 'warning', confirmLabel: 'Close PO' }); if (ok) closePOMutation.mutate(); }}
            disabled={closePOMutation.isPending}
            className="flex-1 py-2 px-3 text-xs bg-orange-100 text-orange-700 border border-orange-300 rounded-xl hover:bg-orange-200 disabled:opacity-50 font-medium"
          >
            Force Close
          </button>
        )}
        <button
          onClick={() => printPOMutation.mutate()}
          disabled={printPOMutation.isPending}
          className="flex-1 py-2 px-3 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-200 disabled:opacity-50 font-medium flex items-center justify-center gap-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          {printPOMutation.isPending ? 'Preparing...' : 'Print PO'}
        </button>
      </div>

      {/* Invoice number entry modal */}
      {showInvoiceModal && (
        <div className="mx-6 mb-4 p-4 border border-indigo-200 rounded-xl bg-indigo-50 space-y-3">
          <p className="text-sm font-medium text-indigo-800">Enter Supplier Invoice Number</p>
          <input
            type="text"
            value={invoiceNumberInput}
            onChange={(e) => setInvoiceNumberInput(e.target.value)}
            placeholder="e.g. INV-2024-00123"
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => invoicePO.mutate(invoiceNumberInput)}
              disabled={!invoiceNumberInput.trim() || invoicePO.isPending}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {invoicePO.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {invoicePO.isPending ? 'Saving…' : 'Record Invoice'}
            </button>
            <button
              onClick={() => { setShowInvoiceModal(false); setInvoiceNumberInput(''); }}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showEmailPO && (
        <div className="mx-6 mb-4 p-4 border rounded-xl bg-gray-50 space-y-3">
          <p className="text-sm font-medium text-gray-700">Email Purchase Order</p>
          <input
            type="email"
            value={emailRecipient}
            onChange={(e) => setEmailRecipient(e.target.value)}
            placeholder="supplier@example.com"
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          {emailResult && (
            <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${emailResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {emailResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {emailResult.message}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => emailPO.mutate()}
              disabled={!emailRecipient || emailPO.isPending}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {emailPO.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {emailPO.isPending ? 'Sending…' : 'Send'}
            </button>
            <button
              onClick={() => { setShowEmailPO(false); setEmailResult(null); }}
              className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

// ─── Vendor Catalogue Tab ────────────────────────────────────────────────────

interface VendorCatalogueTabProps {
  businessId: string;
  storeId: string;
  suppliers: Supplier[];
  catalogueSupplierId: string;
  setCatalogueSupplierId: (id: string) => void;
  catalogueItems: Array<{ name: string; sku: string; unitCostKES: string; barcode: string }>;
  setCatalogueItems: (items: Array<{ name: string; sku: string; unitCostKES: string; barcode: string }>) => void;
  catalogueSearch: string;
  setCatalogueSearch: (s: string) => void;
  onPOCreated: () => void;
}

function VendorCatalogueTab({
  businessId, suppliers, catalogueSupplierId, setCatalogueSupplierId,
  catalogueItems, setCatalogueItems, catalogueSearch, setCatalogueSearch, onPOCreated,
}: VendorCatalogueTabProps) {
  const qc = useQueryClient();
  const { confirm } = useDialog();

  const { data: existingItems = [], isLoading } = useQuery<any[]>({
    queryKey: ['supplier-catalogue', businessId, catalogueSupplierId],
    queryFn: () => api.get(`/suppliers/catalogue?businessId=${businessId}&supplierId=${catalogueSupplierId}${catalogueSearch ? `&search=${catalogueSearch}` : ''}`),
    enabled: !!businessId && !!catalogueSupplierId,
  });

  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const bulkSave = useMutation({
    mutationFn: () => api.post('/suppliers/catalogue', {
      businessId,
      supplierId: catalogueSupplierId,
      items: catalogueItems
        .filter(i => i.name.trim())
        .map(i => ({
          name: i.name,
          sku: i.sku || undefined,
          barcode: i.barcode || undefined,
          unitCostCents: Math.round(parseFloat(i.unitCostKES || '0') * 100),
        })),
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-catalogue'] });
      setCatalogueItems([{ name: '', sku: '', unitCostKES: '', barcode: '' }]);
      toast.success('Catalogue items saved');
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/catalogue/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['supplier-catalogue'] }),
  });

  const createPO = useMutation({
    mutationFn: () => api.post('/suppliers/catalogue/create-po', {
      businessId,
      supplierId: catalogueSupplierId,
      lines: Object.entries(quantities)
        .filter(([, qty]) => parseFloat(qty) > 0)
        .map(([catalogueItemId, qty]) => ({ catalogueItemId, quantity: parseFloat(qty) })),
    }),
    onSuccess: () => { toast.success('PO created from catalogue'); onPOCreated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRow = (idx: number, field: string, value: string) =>
    setCatalogueItems(catalogueItems.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  return (
    <div className="space-y-6">
      {/* Supplier selector */}
      <div className="flex items-center gap-4">
        <select
          value={catalogueSupplierId}
          onChange={e => setCatalogueSupplierId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm min-w-48" aria-label="— Select supplier —">
          <option value="">— Select supplier —</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {catalogueSupplierId && (
          <input
            type="text" placeholder="Search catalogue..."
            value={catalogueSearch}
            onChange={e => setCatalogueSearch(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
          />
        )}
      </div>

      {/* Existing catalogue items */}
      {catalogueSupplierId && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-700 text-sm">Catalogue Items ({existingItems.length})</h3>
            {Object.values(quantities).some(q => parseFloat(q) > 0) && (
              <button
                onClick={() => createPO.mutate()}
                disabled={createPO.isPending}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {createPO.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                Create PO from Selection
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
          ) : existingItems.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">No catalogue items yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">SKU</th>
                  <th className="px-4 py-2 text-left hidden sm:table-cell">Barcode</th>
                  <th className="px-4 py-2 text-right">Unit Cost</th>
                  <th className="px-4 py-2 text-center w-24">Order Qty</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {existingItems.map((item: any) => (
                  <tr key={item.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{item.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">{item.sku ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs hidden sm:table-cell">{item.barcode ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 font-medium">
                      KES {(item.unitCostCents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number" min={0} step={1}
                        value={quantities[item.id] ?? ''}
                        onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                        placeholder="0"
                        className="w-full border rounded-lg px-2 py-1 text-center text-sm"
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        onClick={async () => { const ok = await confirm({ title: 'Remove Item', message: 'Remove this item from the supplier catalogue?', variant: 'danger', confirmLabel: 'Remove' }); if (ok) deleteItem.mutate(item.id); }}
                        className="text-red-400 hover:text-red-600" aria-label="Remove">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add new items form */}
      {catalogueSupplierId && (
        <div className="bg-white rounded-xl border p-5 space-y-4">
          <h3 className="font-semibold text-gray-700 text-sm">Add Items to Catalogue</h3>
          <div className="space-y-2">
            {catalogueItems.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                <input
                  placeholder="Item name *"
                  value={row.name}
                  onChange={e => updateRow(idx, 'name', e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm col-span-2 sm:col-span-1"
                />
                <input
                  placeholder="SKU"
                  value={row.sku}
                  onChange={e => updateRow(idx, 'sku', e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm hidden sm:block"
                />
                <input
                  placeholder="Barcode"
                  value={row.barcode}
                  onChange={e => updateRow(idx, 'barcode', e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm hidden sm:block"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" min={0} step={0.01}
                    placeholder="Cost (KES)"
                    value={row.unitCostKES}
                    onChange={e => updateRow(idx, 'unitCostKES', e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm flex-1"
                  />
                  <button
                    onClick={() => setCatalogueItems(catalogueItems.filter((_, i) => i !== idx))}
                    disabled={catalogueItems.length === 1}
                    className="text-red-400 hover:text-red-600 disabled:opacity-30" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCatalogueItems([...catalogueItems, { name: '', sku: '', unitCostKES: '', barcode: '' }])}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              <Plus className="w-4 h-4" /> Add Row
            </button>
            <button
              onClick={() => bulkSave.mutate()}
              disabled={!catalogueItems.some(i => i.name.trim()) || bulkSave.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-40 flex items-center gap-2"
            >
              {bulkSave.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save to Catalogue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Auto-Reorder Tab ─────────────────────────────────────────────────────────

interface AutoReorderTabProps {
  businessId: string;
  storeId: string;
  suppliers: Supplier[];
  reorderSupplierId: string;
  setReorderSupplierId: (id: string) => void;
  reorderResult: any;
  setReorderResult: (r: any) => void;
  reorderLoading: boolean;
  setReorderLoading: (l: boolean) => void;
  onPOCreated: () => void;
}

function AutoReorderTab({
  businessId, storeId, suppliers,
  reorderSupplierId, setReorderSupplierId,
  reorderResult, setReorderResult,
  reorderLoading, setReorderLoading,
  onPOCreated,
}: AutoReorderTabProps) {
  const runCheck = async () => {
    setReorderLoading(true);
    setReorderResult(null);
    try {
      const result = await api.post('/suppliers/auto-reorder', {
        businessId,
        storeId,
        supplierId: reorderSupplierId || undefined,
      });
      setReorderResult(result);
      if ((result as any)?.posCreated) {
        toast.success(`Auto-reorder PO created: ${(result as any).posCreated.poNumber}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? 'Auto-reorder check failed');
    } finally {
      setReorderLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-800">Auto-Reorder Check</h3>
          <p className="text-sm text-gray-500 mt-1">
            Scans all items with a reorder level set. If current stock ≤ reorder level, a DRAFT PO is automatically created.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Supplier (optional)</label>
          <select
            value={reorderSupplierId}
            onChange={e => setReorderSupplierId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs">
            <option value="">— Use default supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button
          onClick={runCheck}
          disabled={reorderLoading}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {reorderLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
          {reorderLoading ? 'Checking...' : 'Run Auto-Reorder Check'}
        </button>
      </div>

      {reorderResult && (
        <div className={`rounded-xl border p-5 ${
          reorderResult.posCreated ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <p className={`font-semibold mb-3 ${
            reorderResult.posCreated ? 'text-green-800' : 'text-gray-700'
          }`}>
            {reorderResult.message}
          </p>

          {reorderResult.posCreated && (
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm text-green-700">
                PO: <strong className="font-mono">{reorderResult.posCreated.poNumber}</strong>
              </span>
              <button
                onClick={onPOCreated}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                View in Purchase Orders →
              </button>
            </div>
          )}

          {reorderResult.triggered?.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-white text-xs font-semibold text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-center">Current Stock</th>
                    <th className="px-4 py-2 text-center">Reorder Level</th>
                    <th className="px-4 py-2 text-center">Reorder Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {reorderResult.triggered.map((t: any) => (
                    <tr key={t.itemId} className="border-t">
                      <td className="px-4 py-2 font-medium text-gray-800">{t.name}</td>
                      <td className="px-4 py-2 text-center text-red-600 font-semibold">{t.currentStock}</td>
                      <td className="px-4 py-2 text-center text-gray-600">{t.reorderLevel}</td>
                      <td className="px-4 py-2 text-center text-blue-600 font-semibold">{t.reorderQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'suppliers' | 'purchase-orders' | 'credit-notes' | 'returns' | 'invoices' | 'price-agreements' | 'landed-cost' | 'catalogue' | 'auto-reorder';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const pharmacist = user?.role === 'PHARMACIST';
  const { confirm } = useDialog();
  const [tab, setTab] = useState<Tab>('suppliers');
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [showCreatePO, setShowCreatePO] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poStatusFilter, setPOStatusFilter] = useState('ALL');
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', creditLimit: '',
  });
  const [formError, setFormError] = useState('');

  // Vendor catalogue state
  const [catalogueSupplierId, setCatalogueSupplierId] = useState('');
  const [catalogueItems, setCatalogueItems] = useState<Array<{ name: string; sku: string; unitCostKES: string; barcode: string }>>([{ name: '', sku: '', unitCostKES: '', barcode: '' }]);
  const [catalogueSearch, setCatalogueSearch] = useState('');

  // Auto-reorder state
  const [reorderResult, setReorderResult] = useState<any>(null);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderSupplierId, setReorderSupplierId] = useState('');

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

  interface CreditNote {
    id: string;
    creditNumber: string;
    supplierId: string;
    supplier: { name: string };
    amountCents: number;
    reason: string;
    status: 'OPEN' | 'APPLIED' | 'VOIDED';
    issuedDate: string;
  }

  const { data: creditNotes = [] } = useQuery<CreditNote[]>({
    queryKey: ['credit-notes', businessId],
    queryFn: () => api.get<CreditNote[]>(`/suppliers/credit-notes?businessId=${businessId}`),
    enabled: !!businessId && tab === 'credit-notes',
  });

  const [cnForm, setCnForm] = useState({ supplierId: '', amountKES: '', reason: '' });
  const [showAddCN, setShowAddCN] = useState(false);

  // ── Catalog items (for return form) ──
  const { data: catalogItems = [] } = useQuery<CatalogItem[]>({
    queryKey: ['catalog-items-suppliers', businessId],
    queryFn: () => api.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && tab === 'returns',
  });

  // ── Returns state ──
  const { data: supplierReturns = [] } = useQuery<SupplierReturn[]>({
    queryKey: ['supplier-returns', businessId],
    queryFn: () => api.get<SupplierReturn[]>(`/suppliers/returns?businessId=${businessId}`),
    enabled: !!businessId && tab === 'returns',
  });
  const [showNewReturn, setShowNewReturn] = useState(false);
  const [returnForm, setReturnForm] = useState({
    supplierId: '', reason: '', notes: '',
    itemName: '', itemId: '', qty: '1', unitCostKES: '0', itemReason: '',
  });

  const createReturn = useMutation({
    mutationFn: () => {
      const items = returnForm.itemId ? [{
        itemId: returnForm.itemId,
        quantity: parseInt(returnForm.qty) || 1,
        unitCostCents: Math.round(parseFloat(returnForm.unitCostKES || '0') * 100),
        reason: returnForm.itemReason || undefined,
      }] : [];
      return api.post('/suppliers/returns', {
        businessId,
        supplierId: returnForm.supplierId,
        reason: returnForm.reason,
        notes: returnForm.notes || undefined,
        storeId,
        items,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-returns'] });
      setShowNewReturn(false);
      setReturnForm({ supplierId: '', reason: '', notes: '', itemName: '', itemId: '', qty: '1', unitCostKES: '0', itemReason: '' });
    },
  });

  const [crediting, setCrediting] = useState<SupplierReturn | null>(null);
  const [creditForm, setCreditForm] = useState({ number: '', amount: '' });
  const returnStatus = useMutation({
    mutationFn: ({ id, status, creditNoteNumber, amountCents }: { id: string; status: 'CREDITED' | 'CANCELLED'; creditNoteNumber?: string; amountCents?: number }) => api.patch(`/suppliers/returns/${id}/status`, { status, creditNoteNumber, amountCents }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['supplier-returns'] }); void qc.invalidateQueries({ queryKey: ['batches'] }); void qc.invalidateQueries({ queryKey: ['supplier-credit-notes'] }); setCrediting(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Price Agreements state ──
  const [priceAgreementSupplierId, setPriceAgreementSupplierId] = useState('');
  const { data: priceAgreements = [], refetch: refetchAgreements } = useQuery<any[]>({
    queryKey: ['price-agreements', businessId, priceAgreementSupplierId],
    queryFn: () => api.get(`/suppliers/price-agreements?businessId=${businessId}${priceAgreementSupplierId ? `&supplierId=${priceAgreementSupplierId}` : ''}`),
    enabled: !!businessId && tab === 'price-agreements',
  });
  const [paForm, setPaForm] = useState({ supplierId: '', itemId: '', itemName: '', agreedPriceCents: '', currency: 'KES', validFrom: '', validTo: '', minQty: '1', notes: '' });
  const createAgreement = useMutation({
    mutationFn: () => api.post(`/suppliers/${paForm.supplierId}/price-agreements`, {
      businessId,
      itemId: paForm.itemId || undefined,
      itemName: paForm.itemName,
      agreedPriceCents: Math.round(parseFloat(paForm.agreedPriceCents) * 100),
      currency: paForm.currency,
      validFrom: paForm.validFrom,
      validTo: paForm.validTo || undefined,
      minQty: parseInt(paForm.minQty),
      notes: paForm.notes,
    }),
    onSuccess: () => { void refetchAgreements(); setPaForm({ supplierId: '', itemId: '', itemName: '', agreedPriceCents: '', currency: 'KES', validFrom: '', validTo: '', minQty: '1', notes: '' }); },
  });
  const deleteAgreement = useMutation({
    mutationFn: (id: string) => api.delete(`/suppliers/price-agreements/${id}`),
    onSuccess: () => void refetchAgreements(),
  });

  // ── Landed Cost state ──
  const [landedCostGrnId, setLandedCostGrnId] = useState('');
  const [freightKES, setFreightKES] = useState('');
  const [lcMethod, setLcMethod] = useState<'VALUE' | 'QUANTITY'>('VALUE');
  const allocateLandedCost = useMutation({
    mutationFn: () => api.post(`/suppliers/grn/${landedCostGrnId}/landed-cost`, {
      totalFreightCents: Math.round(parseFloat(freightKES) * 100),
      allocationMethod: lcMethod,
    }),
    onSuccess: () => { setLandedCostGrnId(''); setFreightKES(''); toast.success('Landed cost allocated successfully'); },
  });

  // ── Invoices state ──
  const { data: supplierInvoices = [] } = useQuery<SupplierInvoice[]>({
    queryKey: ['supplier-invoices', businessId],
    queryFn: () => api.get<SupplierInvoice[]>(`/suppliers/invoices?businessId=${businessId}`),
    enabled: !!businessId && tab === 'invoices',
  });
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    supplierId: '', invoiceNumber: '', invoiceDateStr: '', totalKES: '', purchaseOrderId: '', notes: '',
  });
  const [matchResult, setMatchResult] = useState<ThreeWayMatchResult | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  const createInvoice = useMutation({
    mutationFn: () => api.post('/suppliers/invoices', {
      businessId,
      supplierId: invoiceForm.supplierId,
      invoiceNumber: invoiceForm.invoiceNumber,
      invoiceDateStr: invoiceForm.invoiceDateStr,
      totalCents: Math.round(parseFloat(invoiceForm.totalKES || '0') * 100),
      purchaseOrderId: invoiceForm.purchaseOrderId || undefined,
      notes: invoiceForm.notes || undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['supplier-invoices'] });
      setShowNewInvoice(false);
      setInvoiceForm({ supplierId: '', invoiceNumber: '', invoiceDateStr: '', totalKES: '', purchaseOrderId: '', notes: '' });
    },
  });

  const handleThreeWayMatch = async (poId: string) => {
    setMatchLoading(true);
    setMatchResult(null);
    try {
      const result = await api.get<ThreeWayMatchResult>(`/suppliers/purchase-orders/${poId}/three-way-match?businessId=${businessId}`);
      setMatchResult(result);
    } catch {
      // ignore
    } finally {
      setMatchLoading(false);
    }
  };

  const createCN = useMutation({
    mutationFn: () =>
      api.post('/suppliers/credit-notes', {
        businessId,
        supplierId: cnForm.supplierId,
        amountCents: Math.round(parseFloat(cnForm.amountKES) * 100),
        reason: cnForm.reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit-notes'] });
      setCnForm({ supplierId: '', amountKES: '', reason: '' });
      setShowAddCN(false);
    },
  });

  const voidCN = useMutation({
    mutationFn: (id: string) => api.patch(`/suppliers/credit-notes/${id}/void`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['credit-notes'] }),
  });

  const createSupplier = useMutation({
    mutationFn: () =>
      api.post('/suppliers', {
        businessId,
        name: supplierForm.name,
        contact: supplierForm.contact || undefined,
        phone: supplierForm.phone || undefined,
        email: supplierForm.email || undefined,
        address: supplierForm.address || undefined,
        paymentTerms: supplierForm.paymentTerms || undefined,
        creditLimitCents: supplierForm.creditLimit
          ? Math.round(parseFloat(supplierForm.creditLimit) * 100)
          : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      setShowAddSupplier(false);
      setSupplierForm({ name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', creditLimit: '' });
      setFormError('');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Failed'),
  });

  const updateSupplier = useMutation({
    mutationFn: () =>
      api.patch(`/suppliers/${editingSupplier!.id}`, {
        name: supplierForm.name,
        contact: supplierForm.contact || undefined,
        phone: supplierForm.phone || undefined,
        email: supplierForm.email || undefined,
        address: supplierForm.address || undefined,
        paymentTerms: supplierForm.paymentTerms || undefined,
        creditLimitCents: supplierForm.creditLimit
          ? Math.round(parseFloat(supplierForm.creditLimit) * 100)
          : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      setEditingSupplier(null);
      setSupplierForm({ name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', creditLimit: '' });
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
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Suppliers & Procurement</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {suppliers.length} suppliers • {fmt(totalOutstanding)} outstanding
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void refetchSuppliers(); void refetchPOs(); }}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg" aria-label="Refresh">
              <RefreshCw className="w-5 h-5" />
            </button>
            {pharmacist && (tab === 'suppliers' || tab === 'purchase-orders') ? null : tab === 'suppliers' ? (
              <button
                onClick={() => setShowAddSupplier(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                Add Supplier
              </button>
            ) : tab === 'purchase-orders' ? (
              <button
                onClick={() => setShowCreatePO(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                New PO
              </button>
            ) : tab === 'returns' ? (
              <button
                onClick={() => setShowNewReturn(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                New Return
              </button>
            ) : tab === 'invoices' ? (
              <button
                onClick={() => setShowNewInvoice(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                <Plus className="w-4 h-4" />
                New Invoice
              </button>
            ) : null}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 flex-wrap">
          {([
            { id: 'suppliers' as const, label: 'Suppliers', Icon: Package },
            { id: 'purchase-orders' as const, label: 'Purchase Orders', Icon: FileText },
            { id: 'credit-notes' as const, label: 'Credit Notes', Icon: ChevronRight },
            { id: 'returns' as const, label: 'Returns', Icon: Truck },
            { id: 'invoices' as const, label: 'Invoices', Icon: AlertCircle },
            { id: 'price-agreements' as const, label: 'Price Agreements', Icon: FileText },
            { id: 'landed-cost' as const, label: 'Landed Cost', Icon: Package },
            { id: 'catalogue' as const, label: 'Vendor Catalogue', Icon: Package },
            { id: 'auto-reorder' as const, label: 'Auto-Reorder', Icon: RefreshCw },
          ]).filter(({ id }) => !pharmacist || ['suppliers', 'purchase-orders', 'returns'].includes(id)).map(({ id, label, Icon }) => (
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
            {/* ── Edit Supplier ── */}
            {editingSupplier && (
              <div className="bg-white rounded-2xl border-2 border-blue-200 shadow-sm mb-4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-blue-600" />
                    Edit Supplier — {editingSupplier.name}
                  </h2>
                  <button onClick={() => { setEditingSupplier(null); setFormError(''); setSupplierForm({ name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', creditLimit: '' }); }} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      placeholder="07XX XXX XXX"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Used to send RFQs on WhatsApp.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                      placeholder="sales@supplier.co.ke"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={supplierForm.paymentTerms}
                      onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
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
                    onClick={() => updateSupplier.mutate()}
                    disabled={!supplierForm.name || updateSupplier.isPending}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-40 flex items-center gap-2"
                  >
                    {updateSupplier.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Changes
                  </button>
                  <button
                    onClick={() => { setEditingSupplier(null); setFormError(''); setSupplierForm({ name: '', contact: '', phone: '', email: '', address: '', paymentTerms: '', creditLimit: '' }); }}
                    className="px-6 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showAddSupplier && (
              <div className="bg-white rounded-2xl border shadow-sm mb-4 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800">New Supplier</h2>
                  <button onClick={() => { setShowAddSupplier(false); setFormError(''); }} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Close">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      value={supplierForm.phone}
                      onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                      placeholder="07XX XXX XXX"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Used to send RFQs on WhatsApp.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={supplierForm.email}
                      onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                      placeholder="sales@supplier.co.ke"
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                    <select
                      value={supplierForm.paymentTerms}
                      onChange={(e) => setSupplierForm({ ...supplierForm, paymentTerms: e.target.value })}
                      className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
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
                        <td className="px-4 py-4 text-sm text-gray-600 hidden sm:table-cell">
                          {[s.phone, s.email].filter(Boolean).join(' · ') || s.contact || '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{s.paymentTerms ?? '—'}</td>
                        <td className="px-4 py-4 text-right">
                          <span className={`font-semibold text-sm ${s.outstandingBalanceCents > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {fmt(s.outstandingBalanceCents)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setEditingSupplier(s);
                              setSupplierForm({
                                name: s.name,
                                contact: s.contact ?? '',
                                phone: s.phone ?? '',
                                email: s.email ?? '',
                                address: s.address ?? '',
                                paymentTerms: s.paymentTerms ?? '',
                                creditLimit: s.creditLimitCents ? String(s.creditLimitCents / 100) : '',
                              });
                              setFormError('');
                            }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit supplier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
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

        {/* ── Credit Notes Tab ── */}
        {tab === 'credit-notes' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800">Supplier Credit Notes</h2>
              <button
                onClick={() => setShowAddCN(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" /> New Credit Note
              </button>
            </div>

            {showAddCN && (
              <div className="bg-white rounded-xl border p-5 mb-4 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-4">Create Credit Note</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                    <select
                      value={cnForm.supplierId}
                      onChange={(e) => setCnForm((f) => ({ ...f, supplierId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— Select supplier —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={cnForm.amountKES}
                      onChange={(e) => setCnForm((f) => ({ ...f, amountKES: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                    <input
                      type="text"
                      value={cnForm.reason}
                      onChange={(e) => setCnForm((f) => ({ ...f, reason: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Returned goods, pricing error"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  <button onClick={() => setShowAddCN(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
                  <button
                    onClick={() => createCN.mutate()}
                    disabled={!cnForm.supplierId || !cnForm.amountKES || !cnForm.reason || createCN.isPending}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createCN.isPending ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            )}

            {creditNotes.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No credit notes yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Credit #</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditNotes.map((cn) => (
                      <tr key={cn.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono font-semibold text-blue-600">{cn.creditNumber}</td>
                        <td className="px-4 py-3 font-medium">{cn.supplier.name}</td>
                        <td className="px-4 py-3 text-gray-600">{cn.reason}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(cn.amountCents)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            cn.status === 'OPEN' ? 'bg-green-100 text-green-700'
                            : cn.status === 'APPLIED' ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                            {cn.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(cn.issuedDate).toLocaleDateString('en-KE')}
                        </td>
                        <td className="px-4 py-3">
                          {cn.status === 'OPEN' && (
                            <button
                              onClick={() => voidCN.mutate(cn.id)}
                              disabled={voidCN.isPending}
                              className="text-xs text-red-500 hover:text-red-700 font-medium"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Returns Tab ── */}
        {tab === 'returns' && (
          <>
            {showNewReturn && (
              <div className="bg-white rounded-xl border p-5 mb-4 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-4">New Supplier Return</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                    <select
                      value={returnForm.supplierId}
                      onChange={(e) => setReturnForm((f) => ({ ...f, supplierId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— Select supplier —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
                    <input
                      type="text"
                      value={returnForm.reason}
                      onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. Damaged goods, wrong item"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={returnForm.notes}
                      onChange={(e) => setReturnForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="Optional notes"
                    />
                  </div>
                </div>
                <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 uppercase mb-3">Return Item</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-gray-500 mb-1">Item *</label>
                      <select
                        value={returnForm.itemId}
                        onChange={(e) => {
                          const item = catalogItems.find(i => i.id === e.target.value);
                          setReturnForm((f) => ({
                            ...f, itemId: e.target.value, itemName: item?.name ?? '',
                            unitCostKES: item?.costPriceCents ? String(item.costPriceCents / 100) : f.unitCostKES,
                          }));
                        }}
                        className="w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">— Select item —</option>
                        {catalogItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Qty</label>
                      <input
                        type="number" min={1}
                        value={returnForm.qty}
                        onChange={(e) => setReturnForm((f) => ({ ...f, qty: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Unit Cost (KES)</label>
                      <input
                        type="number" min={0} step={0.01}
                        value={returnForm.unitCostKES}
                        onChange={(e) => setReturnForm((f) => ({ ...f, unitCostKES: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowNewReturn(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
                  <button
                    onClick={() => createReturn.mutate()}
                    disabled={!returnForm.supplierId || !returnForm.reason || !returnForm.itemId || createReturn.isPending}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createReturn.isPending ? 'Creating...' : 'Create Return'}
                  </button>
                </div>
              </div>
            )}

            {crediting && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setCrediting(null); }}>
                <form role="dialog" aria-modal="true" aria-label="Supplier credited this return" className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4"
                  onSubmit={(e) => { e.preventDefault(); returnStatus.mutate({ id: crediting.id, status: 'CREDITED', creditNoteNumber: creditForm.number.trim() || undefined, amountCents: Math.round((parseFloat(creditForm.amount) || 0) * 100) }); }}>
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{crediting.returnNumber} credited</h3>
                    <p className="text-sm text-gray-500">A credit note is recorded against {crediting.supplier?.name ?? 'the supplier'} so it can be set against a later order.</p>
                  </div>
                  <div>
                    <label htmlFor="cn-number" className="block text-sm font-medium text-gray-700 mb-1">Supplier's credit note number (optional)</label>
                    <input id="cn-number" value={creditForm.number} onChange={(e) => setCreditForm((f) => ({ ...f, number: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Leave blank to number it for you" />
                  </div>
                  <div>
                    <label htmlFor="cn-amount" className="block text-sm font-medium text-gray-700 mb-1">Amount credited (KES)</label>
                    <input id="cn-amount" inputMode="decimal" value={creditForm.amount} onChange={(e) => setCreditForm((f) => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <p className="text-xs text-gray-500 mt-1">The return was worth {fmt(crediting.totalCents)}. Enter what the supplier actually credited; 0 records no credit note.</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCrediting(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={returnStatus.isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{returnStatus.isPending ? 'Saving…' : 'Mark credited'}</button>
                  </div>
                </form>
              </div>
            )}

            {supplierReturns.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <Truck className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No supplier returns yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Return #</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-left">Lot</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierReturns.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono font-semibold text-blue-600">{r.returnNumber}</td>
                        <td className="px-4 py-3 font-medium">{r.supplier?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.reason}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{[...new Set(r.items.map((i) => i.lotNumber).filter(Boolean))].join(', ') || '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(r.totalCents)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            r.status === 'CREDITED' || r.status === 'APPROVED' ? 'bg-green-100 text-green-700'
                            : r.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-700'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{new Date(r.createdAt).toLocaleDateString('en-KE')}</td>
                        <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                          {['DRAFT', 'SENT', 'APPROVED'].includes(r.status) && (
                            <>
                              <button onClick={() => { setCrediting(r); setCreditForm({ number: '', amount: (r.totalCents / 100).toFixed(2) }); }} disabled={returnStatus.isPending}
                                className="text-xs font-medium text-green-700 border border-green-200 rounded px-2 py-1 hover:bg-green-50 disabled:opacity-50">Credited</button>
                              <button onClick={async () => { const ok = await confirm({ title: `Cancel ${r.returnNumber}`, message: 'The stock goes back into the lot and the store it came from.', variant: 'danger', confirmLabel: 'Cancel return' }); if (ok) returnStatus.mutate({ id: r.id, status: 'CANCELLED' }); }} disabled={returnStatus.isPending}
                                className="text-xs font-medium text-red-700 border border-red-200 rounded px-2 py-1 hover:bg-red-50 disabled:opacity-50">Cancel</button>
                            </>
                          )}
                          <a
                            href={`/api/v1/reports/pdf/debit-note/${r.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50"
                          >
                            Debit Note
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Invoices Tab ── */}
        {tab === 'invoices' && (
          <>
            {matchResult && (
              <div className={`mb-4 p-4 rounded-xl border ${matchResult.overallStatus === 'MATCHED' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-800">
                    3-Way Match: PO {matchResult.po.orderNumber} —
                    <span className={`ml-2 text-sm font-bold ${matchResult.overallStatus === 'MATCHED' ? 'text-green-700' : 'text-red-700'}`}>
                      {matchResult.overallStatus}
                    </span>
                  </h3>
                  <button onClick={() => setMatchResult(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-4 h-4" /></button>
                </div>
                <div className="mb-2 text-sm text-gray-600">
                  PO Value: {fmt(matchResult.po.totalCents)} | Invoice Value: {matchResult.invoice ? fmt(matchResult.invoice.totalCents) : 'No invoice'} |
                  Value Match: {matchResult.valueMatch === null ? 'N/A' : matchResult.valueMatch ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-red-600 font-semibold">No</span>}
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="bg-white/50"><th className="text-left px-2 py-1">Item</th><th className="text-center px-2 py-1">Ordered</th><th className="text-center px-2 py-1">Received</th><th className="text-center px-2 py-1">Status</th></tr></thead>
                  <tbody>
                    {matchResult.lineMatches.map((l) => (
                      <tr key={l.itemId} className="border-t border-white/50">
                        <td className="px-2 py-1">{l.itemName}</td>
                        <td className="px-2 py-1 text-center">{l.orderedQty}</td>
                        <td className="px-2 py-1 text-center">{l.receivedQty}</td>
                        <td className="px-2 py-1 text-center">
                          <span className={`font-semibold ${l.status === 'MATCHED' ? 'text-green-700' : 'text-red-700'}`}>{l.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showNewInvoice && (
              <div className="bg-white rounded-xl border p-5 mb-4 shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-4">New Supplier Invoice</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                    <select
                      value={invoiceForm.supplierId}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, supplierId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— Select supplier —</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Invoice # *</label>
                    <input
                      type="text"
                      value={invoiceForm.invoiceNumber}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="e.g. INV-2026-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Invoice Date *</label>
                    <input
                      type="date"
                      value={invoiceForm.invoiceDateStr}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, invoiceDateStr: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" aria-label="Date" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES) *</label>
                    <input
                      type="number" min={0} step={0.01}
                      value={invoiceForm.totalKES}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, totalKES: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Linked PO # (optional)</label>
                    <select
                      value={invoiceForm.purchaseOrderId}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, purchaseOrderId: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">— None —</option>
                      {purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.poNumber}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                    <input
                      type="text"
                      value={invoiceForm.notes}
                      onChange={(e) => setInvoiceForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4 justify-end">
                  <button onClick={() => setShowNewInvoice(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
                  <button
                    onClick={() => createInvoice.mutate()}
                    disabled={!invoiceForm.supplierId || !invoiceForm.invoiceNumber || !invoiceForm.invoiceDateStr || !invoiceForm.totalKES || createInvoice.isPending}
                    className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createInvoice.isPending ? 'Saving...' : 'Save Invoice'}
                  </button>
                </div>
              </div>
            )}

            {supplierInvoices.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500">No supplier invoices yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs font-semibold uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Invoice #</th>
                      <th className="px-4 py-3 text-left">Supplier</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">PO #</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-left">Date</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono font-semibold text-blue-600">{inv.invoiceNumber}</td>
                        <td className="px-4 py-3 font-medium">{inv.supplier?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                          {inv.purchaseOrderId ? (purchaseOrders.find(p => p.id === inv.purchaseOrderId)?.poNumber ?? inv.purchaseOrderId) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(inv.totalCents)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            inv.status === 'MATCHED' ? 'bg-green-100 text-green-700'
                            : inv.status === 'UNMATCHED' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{inv.invoiceDateStr}</td>
                        <td className="px-4 py-3">
                          {inv.purchaseOrderId && (
                            <button
                              onClick={() => void handleThreeWayMatch(inv.purchaseOrderId!)}
                              disabled={matchLoading}
                              className="text-xs font-medium text-purple-600 hover:text-purple-800 border border-purple-200 rounded px-2 py-1 hover:bg-purple-50 disabled:opacity-50"
                            >
                              {matchLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Match'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Price Agreements Tab ── */}
        {tab === 'price-agreements' && (
          <div className="space-y-6">
            {/* Filter */}
            <div className="flex items-center gap-3">
              <select value={priceAgreementSupplierId} onChange={e => setPriceAgreementSupplierId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm" aria-label="Filter by suppliers">
                <option value="">All Suppliers</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {/* New Agreement Form */}
            <div className="bg-white rounded-xl border p-5 space-y-4">
              <h3 className="font-semibold text-gray-800">New Price Agreement</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
                  <select value={paForm.supplierId} onChange={e => setPaForm(f => ({ ...f, supplierId: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Item Name *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={paForm.itemName}
                    onChange={e => setPaForm(f => ({ ...f, itemName: e.target.value }))} placeholder="e.g. Sugar 1kg" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Agreed Price (KES) *</label>
                  <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={paForm.agreedPriceCents}
                    onChange={e => setPaForm(f => ({ ...f, agreedPriceCents: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valid From</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={paForm.validFrom}
                    onChange={e => setPaForm(f => ({ ...f, validFrom: e.target.value }))} aria-label="Start date" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valid To</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={paForm.validTo}
                    onChange={e => setPaForm(f => ({ ...f, validTo: e.target.value }))} aria-label="End date" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Min Qty</label>
                  <input type="number" min={1} className="w-full border rounded-lg px-3 py-2 text-sm" value={paForm.minQty}
                    onChange={e => setPaForm(f => ({ ...f, minQty: e.target.value }))} />
                </div>
              </div>
              <button onClick={() => createAgreement.mutate()}
                disabled={!paForm.supplierId || !paForm.itemName || !paForm.agreedPriceCents || createAgreement.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40">
                Add Agreement
              </button>
            </div>
            {/* Agreements List */}
            <div className="overflow-x-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>{['Supplier', 'Item', 'Agreed Price', 'Valid From', 'Valid To', 'Min Qty', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y">
                  {priceAgreements.map((a: any) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{a.supplier?.name ?? '—'}</td>
                      <td className="px-4 py-3">{a.itemName}</td>
                      <td className="px-4 py-3 text-green-700 font-medium">{fmt(a.agreedPriceCents)}</td>
                      <td className="px-4 py-3">{a.validFrom ? new Date(a.validFrom).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">{a.validTo ? new Date(a.validTo).toLocaleDateString() : 'Open'}</td>
                      <td className="px-4 py-3">{a.minQty}</td>
                      <td className="px-4 py-3">
                        <button onClick={async () => { const ok = await confirm({ title: 'Delete Agreement', message: 'Delete this supplier agreement? This cannot be undone.', variant: 'danger', confirmLabel: 'Delete' }); if (ok) deleteAgreement.mutate(a.id); }}
                          className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {priceAgreements.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">No price agreements</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Landed Cost Tab ── */}
        {tab === 'landed-cost' && (
          <div className="max-w-lg space-y-6">
            <div className="bg-white rounded-xl border p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Allocate Landed Cost to GRN</h3>
              <p className="text-sm text-gray-500">Spread freight, duty, and other import costs across all items in a GRN receipt.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GRN ID</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={landedCostGrnId}
                  onChange={e => setLandedCostGrnId(e.target.value)} placeholder="Paste GRN ID from a received PO" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total Freight / Duty (KES)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={freightKES}
                  onChange={e => setFreightKES(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocation Method</label>
                <div className="flex gap-4">
                  {(['VALUE', 'QUANTITY'] as const).map(m => (
                    <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" checked={lcMethod === m} onChange={() => setLcMethod(m)} />
                      {m === 'VALUE' ? 'By Item Value' : 'Equal per Item'}
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={() => allocateLandedCost.mutate()}
                disabled={!landedCostGrnId || !freightKES || allocateLandedCost.isPending}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-40">
                {allocateLandedCost.isPending ? 'Allocating…' : 'Allocate Landed Cost'}
              </button>
            </div>
          </div>
        )}

        {/* ── Vendor Catalogue Tab ── */}
        {tab === 'catalogue' && (
          <VendorCatalogueTab
            businessId={businessId}
            storeId={storeId}
            suppliers={suppliers}
            catalogueSupplierId={catalogueSupplierId}
            setCatalogueSupplierId={setCatalogueSupplierId}
            catalogueItems={catalogueItems}
            setCatalogueItems={setCatalogueItems}
            catalogueSearch={catalogueSearch}
            setCatalogueSearch={setCatalogueSearch}
            onPOCreated={() => setTab('purchase-orders')}
          />
        )}

        {/* ── Auto-Reorder Tab ── */}
        {tab === 'auto-reorder' && (
          <AutoReorderTab
            businessId={businessId}
            storeId={storeId}
            suppliers={suppliers}
            reorderSupplierId={reorderSupplierId}
            setReorderSupplierId={setReorderSupplierId}
            reorderResult={reorderResult}
            setReorderResult={setReorderResult}
            reorderLoading={reorderLoading}
            setReorderLoading={setReorderLoading}
            onPOCreated={() => setTab('purchase-orders')}
          />
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
