import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, openPdfReport } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../components/Dialog';
import { toast } from 'sonner';
import {
  ClipboardList, X, ChevronRight, Printer, CheckCircle,
  Package, Truck, AlertTriangle, Clock, User, MapPin,
  Plus, Trash2, Search, FileText,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'CONFIRMED' | 'PACKED' | 'DISPATCHED' | 'DELIVERED' | 'INVOICED' | 'CANCELLED';
type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

interface FieldOrderItem {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isSample: boolean;
  deliveredQuantity?: number;
  backOrderQuantity?: number;
}

interface FieldOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  subtotalCents: number;
  vatCents: number;
  expectedDeliveryDate?: string;
  isSampleOrder: boolean;
  rejectionReason?: string;
  confirmedAt?: string;
  packedAt?: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  invoiceNumber?: string;
  invoicedAt?: string;
  paidAmountCents: number;
  mpesaReference?: string;
  agentId: string;
  agentName?: string;
  customerId: string;
  customerName?: string;
  shopCode?: string;
  routeId?: string;
  routeName?: string;
  items?: FieldOrderItem[];
  deliveryRunId?: string;
  deliveryRunName?: string;
  proof?: {
    receivedByName?: string;
    signatureBase64?: string;
    latitude?: number;
    longitude?: number;
    notes?: string;
  };
}

interface SalesRoute {
  id: string;
  name: string;
  color?: string;
  isActive: boolean;
}

interface DeliveryRun {
  id: string;
  routeId: string;
  routeName?: string;
  /** The API returns the route as a nested object; routeName is not a top-level field. */
  route?: { id: string; name: string; color?: string };
  driver?: { id: string; name: string } | null;
  date: string;
  status: string;
}

interface FieldCustomer {
  id: string;
  name: string;
  phone: string;
  shopCode: string;
  shopType: string;
  routeId: string | null;
  routeName: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  retailPriceCents: number;
  quantity: number;
}

interface NewOrderLine {
  itemId: string;
  itemName: string;
  itemSku: string;
  quantity: number;
  unitPriceCents: number;
  isSample: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtKES(cents: number) {
  return (cents / 100).toLocaleString('en-KE', { style: 'currency', currency: 'KES' });
}

function fmtDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_ORDER: OrderStatus[] = ['SUBMITTED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'];

const STATUS_STYLES: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  DRAFT:      { bg: 'bg-gray-100 dark:bg-gray-700',    text: 'text-gray-600 dark:text-gray-300',   border: 'border-gray-200 dark:border-gray-600' },
  SUBMITTED:  { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-700' },
  CONFIRMED:  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-700' },
  PACKED:     { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-700' },
  DISPATCHED: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-700' },
  DELIVERED:  { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', border: 'border-green-200 dark:border-green-700' },
  INVOICED:   { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-700' },
  CANCELLED:  { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-700' },
};

const PAYMENT_BADGE: Record<PaymentStatus, string> = {
  UNPAID:  'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  PARTIAL: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  PAID:    'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};

// ── Picking List Print Helper ─────────────────────────────────────────────────

function printPickingList(order: FieldOrder, businessName: string) {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) {
    toast.error('Popup blocked — allow popups for this site to print');
    return;
  }
  win.document.write(`
    <html><head><title>Picking List - ${order.orderNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; font-size: 13px; }
      h2 { margin: 0 0 4px; } p { margin: 2px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; font-weight: 600; }
      .footer { margin-top: 24px; border-top: 1px solid #ccc; padding-top: 12px; }
      .sample-badge { background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 600; }
    </style>
    </head><body>
    <h2>${businessName}</h2>
    <p><strong>PICKING LIST</strong> — ${order.orderNumber}</p>
    <p>Date: ${fmtDate(new Date().toISOString())} &nbsp;|&nbsp; Expected delivery: ${fmtDate(order.expectedDeliveryDate)}</p>
    <p>Customer: ${order.customerName ?? '—'} (${order.shopCode ?? ''})</p>
    <table>
      <thead><tr><th>Item Name</th><th>SKU</th><th>Quantity</th><th>Unit</th><th>Notes</th></tr></thead>
      <tbody>
        ${(order.items ?? []).map(item => `
          <tr>
            <td>${item.itemName}</td>
            <td>${item.itemId}</td>
            <td>${item.quantity}</td>
            <td>PCS</td>
            <td>${item.isSample ? '<span class="sample-badge">SAMPLE - NFC</span>' : ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="footer">
      <p>Packed by: _________________________________ &nbsp;&nbsp; Date: _____________</p>
    </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  // Let the new document lay out before printing, and leave the window open so the
  // user can retry from the browser dialog (closing immediately cancels the job).
  setTimeout(() => win.print(), 250);
}

// ── New Order Modal ───────────────────────────────────────────────────────────

function NewOrderModal({
  businessId,
  agentId,
  onClose,
  onCreated,
}: {
  businessId: string;
  agentId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const qc = useQueryClient();

  // Customer selector
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<FieldCustomer | null>(null);

  // Item selector
  const [itemSearch, setItemSearch] = useState('');

  // Order lines
  const [lines, setLines] = useState<NewOrderLine[]>([]);
  const [notes, setNotes] = useState('');
  const [isSampleOrder, setIsSampleOrder] = useState(false);
  const [routeId, setRouteId] = useState('');

  // Fetch customers
  const { data: customers = [] } = useQuery<FieldCustomer[]>({
    queryKey: ['field-customers', businessId],
    queryFn: () => api.get(`/field-sales/customers?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // Fetch inventory items
  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['items', businessId, 'active'],
    queryFn: () => api.get(`/items?businessId=${businessId}&activeOnly=true`),
    enabled: !!businessId,
  });

  const { data: routes = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['sales-routes', businessId],
    queryFn: () => api.get(`/field-sales/routes?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const filteredCustomers = customers.filter(
    (c) => !customerSearch || c.name?.toLowerCase().includes(customerSearch.toLowerCase()) || c.shopCode?.toLowerCase().includes(customerSearch.toLowerCase()),
  );

  const filteredItems = items.filter(
    (it) => !itemSearch || it.name?.toLowerCase().includes(itemSearch.toLowerCase()) || it.sku?.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  const addLine = useCallback((item: InventoryItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.itemId === item.id);
      if (existing) {
        return prev.map((l) => l.itemId === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, {
        itemId: item.id,
        itemName: item.name,
        itemSku: item.sku,
        quantity: 1,
        unitPriceCents: item.retailPriceCents,
        isSample: false,
      }];
    });
    setItemSearch('');
  }, []);

  const updateLine = (itemId: string, field: keyof NewOrderLine, value: number | boolean) => {
    setLines((prev) => prev.map((l) => l.itemId === itemId ? { ...l, [field]: value } : l));
  };

  const removeLine = (itemId: string) => setLines((prev) => prev.filter((l) => l.itemId !== itemId));

  const totalCents = lines.reduce((sum, l) => sum + (l.isSample ? 0 : l.quantity * l.unitPriceCents), 0);

  const createMutation = useMutation({
    mutationFn: () => api.post('/field-sales/orders', {
      agentId,
      businessId,
      customerId: selectedCustomer!.id,
      routeId: routeId || undefined,
      notes: notes || undefined,
      isSampleOrder,
      items: lines.map((l) => ({
        itemId: l.itemId,
        itemName: l.itemName,
        itemSku: l.itemSku,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        isSample: l.isSample,
      })),
    }),
    onSuccess: () => {
      toast.success('Field order created');
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      onCreated();
    },
    onError: () => toast.error('Failed to create order'),
  });

  const canSubmit = !!selectedCustomer && lines.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">New Field Order</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">Select a customer, add items, then submit</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Step 1: Customer */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              1. Customer *
            </label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl">
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedCustomer.shopCode} · {selectedCustomer.phone}</p>
                  {selectedCustomer.routeName && <p className="text-xs text-indigo-600 dark:text-indigo-400"><MapPin className="w-3 h-3 inline" /> {selectedCustomer.routeName}</p>}
                </div>
                <button onClick={() => setSelectedCustomer(null)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Change</button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or shop code…"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
                  />
                </div>
                {customerSearch && (
                  <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    {filteredCustomers.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">No customers found</p>
                    )}
                    {filteredCustomers.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); if (c.routeId) setRouteId(c.routeId); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 text-left border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                      >
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                          <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">{c.shopCode}</span>
                        </div>
                        {c.routeName && <span className="text-xs text-indigo-500 dark:text-indigo-400">{c.routeName}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Route + Options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Route</label>
              <select
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
              >
                <option value="">No route</option>
                {routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={isSampleOrder} onChange={(e) => setIsSampleOrder(e.target.checked)} className="w-4 h-4 accent-indigo-600 rounded" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Sample order (no charge)</span>
              </label>
            </div>
          </div>

          {/* Step 3: Items */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              2. Items *
            </label>

            {/* Item search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search items to add…"
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-indigo-500"
              />
              {itemSearch && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {filteredItems.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">No items found</p>
                  )}
                  {filteredItems.slice(0, 10).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addLine(item)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/60 text-left border-b border-gray-100 dark:border-gray-700 last:border-0 transition-colors"
                    >
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white">{item.name}</span>
                        <span className="text-gray-400 ml-2 text-xs">{item.sku}</span>
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {fmtKES(item.retailPriceCents)} · Qty: {item.quantity}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Order lines */}
            {lines.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 dark:text-gray-600 text-sm">
                Search and add items above
              </div>
            ) : (
              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Item</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Qty</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Unit Price</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">Sample</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {lines.map((line) => (
                      <tr key={line.itemId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900 dark:text-white text-xs leading-tight">{line.itemName}</p>
                          <p className="text-[10px] text-gray-400">{line.itemSku}</p>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(line.itemId, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-center text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            value={(line.unitPriceCents / 100).toFixed(2)}
                            onChange={(e) => updateLine(line.itemId, 'unitPriceCents', Math.round(parseFloat(e.target.value || '0') * 100))}
                            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-right text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={line.isSample}
                            onChange={(e) => updateLine(line.itemId, 'isSample', e.target.checked)}
                            className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                          />
                        </td>
                        <td className="pr-2 py-2">
                          <button onClick={() => removeLine(line.itemId)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between text-sm border-t border-gray-100 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                  <span className="font-bold text-gray-900 dark:text-white">Total: {fmtKES(totalCents)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Delivery instructions, special requests…"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:border-indigo-400 dark:focus:border-indigo-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {!selectedCustomer && <span className="text-amber-600 dark:text-amber-400 font-medium">Select a customer</span>}
            {selectedCustomer && lines.length === 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">Add at least one item</span>}
            {canSubmit && <span className="text-green-600 dark:text-green-400 font-medium">{lines.length} item{lines.length !== 1 ? 's' : ''} · {fmtKES(totalCents)}</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
            <button
              onClick={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              {createMutation.isPending ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating…</>
              ) : (
                <><ClipboardList className="w-4 h-4" /> Create Order</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────

function OrderCard({ order, onClick }: { order: FieldOrder; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 cursor-pointer hover:shadow-md transition-all hover:border-indigo-300 dark:hover:border-indigo-600 mb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">{order.orderNumber}</p>
          <p className="font-semibold text-sm text-gray-900 dark:text-white mt-0.5 truncate">{order.customerName ?? '—'}</p>
          {order.shopCode && <p className="text-xs text-gray-400 dark:text-gray-500">{order.shopCode}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-bold text-sm text-gray-900 dark:text-white">{fmtKES(order.totalCents)}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAYMENT_BADGE[order.paymentStatus]}`}>
          {order.paymentStatus}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        {order.agentName && <span><User className="w-3 h-3 inline mr-0.5" />{order.agentName}</span>}
        {order.expectedDeliveryDate && (
          <span><Clock className="w-3 h-3 inline mr-0.5" />{fmtDate(order.expectedDeliveryDate)}</span>
        )}
        {order.items && <span><Package className="w-3 h-3 inline mr-0.5" />{order.items.length} items</span>}
      </div>
    </div>
  );
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

function OrderDetailPanel({
  order, businessName, onClose, onRefresh,
}: {
  order: FieldOrder;
  businessName: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { prompt } = useDialog();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const [expectedDate, setExpectedDate] = useState(order.expectedDeliveryDate?.split('T')[0] ?? '');
  const [showRunModal, setShowRunModal] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [newRunRouteId, setNewRunRouteId] = useState(order.routeId ?? '');
  const [newRunDate, setNewRunDate] = useState(
    (order.expectedDeliveryDate ?? new Date().toISOString()).split('T')[0],
  );
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');

  // Any run that has not been closed out can still receive orders — not just PLANNED ones.
  const { data: allRuns = [] } = useQuery<DeliveryRun[]>({
    queryKey: ['delivery-runs-open', businessId],
    queryFn: () => api.get(`/delivery-routes/runs?businessId=${businessId}`),
    enabled: showRunModal,
  });
  const runs = allRuns.filter((r) => r.status === 'PLANNED' || r.status === 'IN_PROGRESS');

  const { data: allRoutes = [] } = useQuery<SalesRoute[]>({
    queryKey: ['sales-routes', businessId],
    queryFn: () => api.get(`/field-sales/routes?businessId=${businessId}`),
    enabled: showRunModal,
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { status: OrderStatus; expectedDeliveryDate?: string; rejectionReason?: string }) =>
      api.patch(`/field-sales/orders/${order.id}/status`, { ...payload, businessId }),
    onSuccess: () => {
      toast.success('Order status updated');
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const assignRunMutation = useMutation({
    mutationFn: (runId: string) =>
      api.post(`/delivery-routes/runs/${runId}/orders`, { fieldOrderId: order.id, businessId }),
    onSuccess: () => {
      toast.success('Added to delivery run');
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
      setShowRunModal(false);
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // No open run yet — create one for this order in a single step so the user isn't
  // bounced to the Delivery Routes page mid-flow.
  const createRunMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/delivery-routes/runs', {
        businessId,
        routeId: newRunRouteId || order.routeId,
        date: newRunDate,
        orderIds: [order.id],
      }),
    onSuccess: () => {
      toast.success('Delivery run created and order dispatched');
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
      setShowRunModal(false);
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  /** Open the printable invoice; the PDF route needs the JWT so window.open() can't be used. */
  async function openInvoice() {
    try {
      await openPdfReport(`/reports/pdf/field-order-invoice/${order.id}`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not open the invoice');
    }
  }

  async function openDeliveryNote() {
    try {
      await openPdfReport(`/reports/pdf/field-order-delivery-note/${order.id}`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not open the delivery note');
    }
  }

  const invoiceMutation = useMutation({
    mutationFn: () =>
      api.post<{ invoiceNumber: string }>(`/field-sales/orders/${order.id}/generate-invoice`, { businessId }),
    onSuccess: (data) => {
      toast.success(`Invoice ${data.invoiceNumber} created — opening it now`);
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      void openInvoice();
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const partialInvoiceMutation = useMutation({
    mutationFn: () =>
      api.post<{ invoiceNumber: string; deliveredItemCount: number }>(`/field-sales/orders/${order.id}/generate-partial-invoice`, { businessId }),
    onSuccess: (data) => {
      toast.success(`Partial invoice ${data.invoiceNumber} created for ${data.deliveredItemCount} delivered item(s)`);
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      void openInvoice();
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const paymentMutation = useMutation({
    mutationFn: () =>
      api.post(`/field-sales/orders/${order.id}/collect-payment?businessId=${businessId}`, {
        amountCents: Math.round(parseFloat(payAmount) * 100),
        method: payMethod,
        reference: payRef || undefined,
        collectedBy: user?.id ?? '',
      }),
    onSuccess: () => {
      toast.success('Payment recorded successfully');
      setShowPaymentModal(false);
      setPayAmount('');
      setPayRef('');
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      onRefresh();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  async function handleConfirm() {
    await statusMutation.mutateAsync({ status: 'CONFIRMED', expectedDeliveryDate: expectedDate || undefined });
  }
  async function handlePack() {
    await statusMutation.mutateAsync({ status: 'PACKED' });
  }
  async function handleReject() {
    const reason = await prompt({ title: 'Rejection Reason', message: 'Enter reason for rejecting this order:', confirmLabel: 'Reject' });
    if (!reason) return;
    await statusMutation.mutateAsync({ status: 'CANCELLED', rejectionReason: reason });
  }

  const canReject = order.status === 'SUBMITTED' || order.status === 'CONFIRMED';
  const canInvoice = ['CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'].includes(order.status);
  const s = STATUS_STYLES[order.status];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div>
            <p className="font-mono text-xs text-gray-400">{order.orderNumber}</p>
            <h2 className="font-bold text-gray-900 dark:text-white text-lg">{order.customerName ?? '—'}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printPickingList(order, businessName)}
              disabled={!['CONFIRMED', 'PACKED'].includes(order.status)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors"
              title="Print Picking List"
            >
              <Printer className="w-4 h-4" />
            </button>
            {['DISPATCHED', 'DELIVERED', 'INVOICED'].includes(order.status) && (
              <button
                onClick={() => void openDeliveryNote()}
                className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 transition-colors"
                title="Print Delivery Note"
              >
                <Truck className="w-4 h-4" />
              </button>
            )}
            {order.status === 'INVOICED' && (
              <button
                onClick={() => void openInvoice()}
                className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 transition-colors"
                title="Print Invoice"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${s.bg} ${s.text}`}>{order.status}</span>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${PAYMENT_BADGE[order.paymentStatus]}`}>{order.paymentStatus}</span>
            {order.isSampleOrder && <span className="text-xs px-3 py-1 rounded-full font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">SAMPLE ORDER</span>}
          </div>

          {/* Customer & Agent info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Customer</p>
              <p className="font-semibold text-sm text-gray-900 dark:text-white">{order.customerName ?? '—'}</p>
              {order.shopCode && <p className="text-xs text-gray-500 dark:text-gray-400">{order.shopCode}</p>}
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Agent</p>
              <p className="font-semibold text-sm text-gray-900 dark:text-white">{order.agentName ?? '—'}</p>
              {order.routeName && <p className="text-xs text-gray-500 dark:text-gray-400"><MapPin className="w-3 h-3 inline mr-0.5" />{order.routeName}</p>}
            </div>
          </div>

          {/* Delivery date for CONFIRMED step */}
          {order.status === 'SUBMITTED' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Order Items ({order.items?.length ?? 0})</p>
            <div className="space-y-2">
              {(order.items ?? []).map((item) => (
                <div key={item.id} className="flex items-start justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.itemName}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Qty: {item.quantity}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{fmtKES(item.unitPriceCents)} each</span>
                      {item.isSample && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold">SAMPLE</span>
                      )}
                    </div>
                    {(item.backOrderQuantity ?? 0) > 0 && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Back-order: {item.backOrderQuantity}</p>
                    )}
                  </div>
                  <span className="font-semibold text-sm text-gray-900 dark:text-white">{fmtKES(item.totalCents)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Subtotal</span><span>{fmtKES(order.subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>VAT (16%)</span><span>{fmtKES(order.vatCents)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 dark:text-white">
              <span>Total</span><span>{fmtKES(order.totalCents)}</span>
            </div>
          </div>

          {/* Invoice info */}
          {order.invoiceNumber && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-3 flex items-center gap-3">
              <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Invoice Generated</p>
                <p className="text-sm font-mono font-bold text-purple-800 dark:text-purple-300">{order.invoiceNumber}</p>
                {order.invoicedAt && <p className="text-xs text-purple-500 dark:text-purple-400">{new Date(order.invoicedAt).toLocaleDateString('en-KE')}</p>}
              </div>
            </div>
          )}

          {/* Rejection reason */}
          {order.rejectionReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Rejection Reason</p>
              <p className="text-sm text-red-700 dark:text-red-300">{order.rejectionReason}</p>
            </div>
          )}

          {/* Dispatch info */}
          {order.status === 'DISPATCHED' && order.deliveryRunName && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">Delivery Run</p>
              <p className="text-sm text-orange-700 dark:text-orange-300">{order.deliveryRunName}</p>
            </div>
          )}

          {/* Proof of delivery */}
          {order.status === 'DELIVERED' && order.proof && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2">Proof of Delivery</p>
              {order.proof.receivedByName && <p className="text-sm text-green-700 dark:text-green-300">Received by: {order.proof.receivedByName}</p>}
              {order.proof.notes && <p className="text-sm text-green-600 dark:text-green-400 mt-1">{order.proof.notes}</p>}
              {order.proof.latitude && <p className="text-xs text-green-600 dark:text-green-400 mt-1"><MapPin className="w-3 h-3 inline mr-0.5" />{order.proof.latitude.toFixed(5)}, {order.proof.longitude?.toFixed(5)}</p>}
              {order.proof.signatureBase64 && (
                <img src={order.proof.signatureBase64} alt="Signature" className="mt-2 border rounded max-h-20 bg-white" />
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-2 bg-white dark:bg-gray-800">
          {order.status === 'SUBMITTED' && (
            <button
              onClick={handleConfirm}
              disabled={statusMutation.isPending}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Confirm Order
            </button>
          )}
          {order.status === 'CONFIRMED' && (
            <button
              onClick={handlePack}
              disabled={statusMutation.isPending}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <Package className="w-4 h-4" /> Mark as Packed
            </button>
          )}
          {order.status === 'PACKED' && (
            <button
              onClick={() => setShowRunModal(true)}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Truck className="w-4 h-4" /> Add to Delivery Run
            </button>
          )}
          {canInvoice && (
            <>
              <button
                onClick={() => invoiceMutation.mutate()}
                disabled={invoiceMutation.isPending}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {invoiceMutation.isPending ? 'Generating…' : 'Generate Invoice (Full)'}
              </button>
              {(order.items ?? []).some((i) => (i.deliveredQuantity ?? 0) > 0 && (i.deliveredQuantity ?? 0) < i.quantity) && (
                <button
                  onClick={() => partialInvoiceMutation.mutate()}
                  disabled={partialInvoiceMutation.isPending}
                  className="w-full py-2.5 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-700 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  {partialInvoiceMutation.isPending ? 'Generating…' : 'Generate Partial Invoice (Delivered Qty)'}
                </button>
              )}
            </>
          )}
          {order.paymentStatus !== 'PAID' && ['INVOICED', 'DELIVERED', 'DISPATCHED'].includes(order.status) && (
            <button
              onClick={() => { setPayAmount(((order.totalCents - order.paidAmountCents) / 100).toFixed(2)); setShowPaymentModal(true); }}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Record Payment
            </button>
          )}
          {canReject && (
            <button
              onClick={handleReject}
              disabled={statusMutation.isPending}
              className="w-full py-2.5 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              <AlertTriangle className="w-4 h-4" /> Reject Order
            </button>
          )}
        </div>
      </div>

      {/* Record Payment modal */}
      {showPaymentModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Record Payment</h3>
              <button onClick={() => setShowPaymentModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Invoice Total</span><span className="font-semibold text-gray-900 dark:text-white">{fmtKES(order.totalCents)}</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400 mt-1"><span>Already Paid</span><span className="font-semibold text-green-600">{fmtKES(order.paidAmountCents)}</span></div>
                <div className="flex justify-between font-bold text-gray-900 dark:text-white mt-1 pt-1 border-t border-gray-200 dark:border-gray-600"><span>Balance Due</span><span className="text-red-600">{fmtKES(order.totalCents - order.paidAmountCents)}</span></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Amount (KES)</label>
                <input type="number" min="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none">
                  <option value="CASH">Cash</option>
                  <option value="MPESA_STK">M-Pesa STK</option>
                  <option value="MPESA_PAYBILL">M-Pesa Paybill</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              {payMethod !== 'CASH' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Reference / Transaction ID</label>
                  <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. QHJ23K8LP0"
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 outline-none" />
                </div>
              )}
            </div>
            <div className="p-4 flex gap-2 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
              <button
                onClick={() => paymentMutation.mutate()}
                disabled={!payAmount || parseFloat(payAmount) <= 0 || paymentMutation.isPending}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {paymentMutation.isPending ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Run assignment modal */}
      {showRunModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm mx-4 shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Assign to Delivery Run</h3>
              <button onClick={() => setShowRunModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
              {runs.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                  No open delivery runs — create one below.
                </p>
              )}
              {runs.map((run) => (
                <label key={run.id} className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <input type="radio" name="run" value={run.id} checked={selectedRunId === run.id} onChange={() => setSelectedRunId(run.id)} className="accent-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{run.route?.name ?? run.routeName ?? 'Route'}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {fmtDate(run.date)} · {run.status}{run.driver ? ` · ${run.driver.name}` : ''}
                    </p>
                  </div>
                </label>
              ))}

              <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Or start a new run</p>
                <select
                  value={newRunRouteId}
                  onChange={(e) => setNewRunRouteId(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Select route…</option>
                  {allRoutes.filter((r) => r.isActive).map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newRunDate}
                  onChange={(e) => setNewRunDate(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <button
                  onClick={() => createRunMutation.mutate()}
                  disabled={!newRunRouteId || !newRunDate || createRunMutation.isPending}
                  className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {createRunMutation.isPending ? 'Creating…' : 'Create run & dispatch'}
                </button>
              </div>
            </div>
            <div className="p-4 flex gap-2 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowRunModal(false)} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
              <button
                onClick={() => selectedRunId && assignRunMutation.mutate(selectedRunId)}
                disabled={!selectedRunId || assignRunMutation.isPending}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {assignRunMutation.isPending ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({ status, orders, onSelect }: { status: OrderStatus; orders: FieldOrder[]; onSelect: (o: FieldOrder) => void }) {
  const s = STATUS_STYLES[status];
  return (
    <div className="flex-shrink-0 w-64 flex flex-col">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b-2 ${s.border} ${s.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-wide ${s.text}`}>{status}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text} border ${s.border}`}>{orders.length}</span>
      </div>
      <div className="flex-1 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl p-2 min-h-40 overflow-y-auto max-h-[calc(100vh-260px)]">
        {orders.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No orders</p>
        )}
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} onClick={() => onSelect(o)} />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FieldOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [routeFilter, setRouteFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<FieldOrder | null>(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  const today = new Date();
  // Show orders from last 3 months by default to avoid missing recent orders
  const threeMonthsAgo = new Date(today);
  threeMonthsAgo.setMonth(today.getMonth() - 3);
  const defaultStartDate = threeMonthsAgo.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(defaultStartDate);
  const [dateTo, setDateTo] = useState(todayStr);

  const { data: orders = [], refetch, isLoading, error } = useQuery<FieldOrder[]>({
    queryKey: ['field-orders', businessId, statusFilter, routeFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ businessId });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (routeFilter) params.set('routeId', routeFilter);
      if (dateFrom) params.set('startDate', dateFrom);
      if (dateTo) params.set('endDate', dateTo);
      
      console.log('🔍 Field Orders Query:', {
        businessId,
        statusFilter,
        routeFilter,
        dateFrom,
        dateTo,
        url: `/field-sales/orders?${params}`
      });
      
      const result = await api.get<FieldOrder[]>(`/field-sales/orders?${params}`);
      console.log('✅ Field Orders Response:', result.length, 'orders');
      return result;
    },
    enabled: !!businessId,
  });

  const { data: routes = [] } = useQuery<SalesRoute[]>({
    queryKey: ['sales-routes', businessId],
    queryFn: () => api.get<SalesRoute[]>(`/field-sales/routes?businessId=${businessId}`),
    enabled: !!businessId,
  });

  function byStatus(s: OrderStatus) {
    return orders.filter((o) => o.status === s);
  }

  const qc = useQueryClient();

  const bulkInvoiceMutation = useMutation({
    mutationFn: () => api.post<{ succeeded: number; failed: number }>('/field-sales/orders/bulk-generate-invoices', { businessId }),
    onSuccess: (data) => {
      toast.success(`Bulk invoicing done: ${data.succeeded} invoices created${data.failed > 0 ? `, ${data.failed} failed` : ''}`);
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      void refetch();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleSelectOrder = (o: FieldOrder) => setSelectedOrder(o);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Field Orders</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{orders.length} orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {byStatus('DELIVERED').length > 0 && (
              <button
                onClick={() => bulkInvoiceMutation.mutate()}
                disabled={bulkInvoiceMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                title={`Generate invoices for all ${byStatus('DELIVERED').length} delivered orders`}
              >
                <FileText className="w-4 h-4" />
                {bulkInvoiceMutation.isPending ? 'Generating…' : `Invoice All Delivered (${byStatus('DELIVERED').length})`}
              </button>
            )}
            <button
              onClick={() => setShowNewOrder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-500/20"
            >
              <Plus className="w-4 h-4" />
              New Order
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {/* Status pills */}
          <div className="flex gap-1 flex-wrap">
            {(['ALL', ...STATUS_ORDER] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {s === 'ALL' ? 'All' : s}
                {s !== 'ALL' && (
                  <span className="ml-1 opacity-70">({byStatus(s as OrderStatus).length})</span>
                )}
              </button>
            ))}
          </div>

          {/* Route filter */}
          <select
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
          >
            <option value="">All Routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>

          {/* Date range */}
          <div className="flex items-center gap-1.5 text-sm">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none" />
            <span className="text-gray-400">–</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none" />
          </div>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Loading orders...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-900 dark:text-white font-semibold mb-2">Failed to load orders</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{(error as Error).message}</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
        {!isLoading && !error && (
          <div className="flex gap-4 h-full" style={{ minWidth: `${STATUS_ORDER.length * 272}px` }}>
            {STATUS_ORDER.map((s) => (
              <KanbanColumn
                key={s}
                status={s}
                orders={byStatus(s)}
                onSelect={handleSelectOrder}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail side panel */}
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          businessName={user?.name ?? 'Business'}
          onClose={() => setSelectedOrder(null)}
          onRefresh={() => {
            refetch();
            setSelectedOrder(null);
          }}
        />
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #picking-list-print { display: block !important; }
        }
      `}</style>

      {/* New Order Modal */}
      {showNewOrder && (
        <NewOrderModal
          businessId={businessId}
          agentId={user?.id ?? ''}
          onClose={() => setShowNewOrder(false)}
          onCreated={() => {
            setShowNewOrder(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}
