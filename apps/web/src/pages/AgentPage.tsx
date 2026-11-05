import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Home, Users, ClipboardList, TrendingUp, Plus, Search, ChevronLeft,
  ChevronRight, MapPin, RefreshCw, AlertTriangle, CheckCircle,
  Package, Phone, X, Navigation, Edit2, MessageCircle, FileText,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

type Screen = 'home' | 'customers' | 'customer-detail' | 'order-history' | 'my-stats' | 'call-plan' | 'credit-collection' | 'leaderboard';
type CustomerTab = 'history' | 'new-order';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentStats {
  ordersToday: number;
  valueTodayCents: number;
  ordersThisMonth: number;
  valueThisMonthCents: number;
  commissionEarnedCents: number;
  commissionTargetCents: number;
  daysLeftInMonth: number;
  recentOrders: FieldOrderSummary[];
}

interface FieldCustomer {
  id: string;
  name: string;
  phone: string;
  shopCode: string;
  shopType: string;
  routeId: string | null;
  routeName: string | null;
  creditLimitCents: number;
  outstandingCents: number;
  lastOrderDate: string | null;
}

interface FieldOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  shopCode: string;
  totalCents: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  invoiceNumber?: string;
}

interface FieldOrderDetail extends FieldOrderSummary {
  items: Array<{ itemName: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  notes: string | null;
  isSampleOrder: boolean;
  routeName: string | null;
  customerPhone?: string;
  invoiceNumber?: string;
  invoicedAt?: string;
  paidAmountCents?: number;
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  retailPriceCents: number;
  quantity: number;
}

interface SalesRoute {
  id: string;
  name: string;
}

interface CreditRequest {
  id: string;
  customerId: string;
  status: string;
  requestedLimitCents: number;
  createdAt: string;
}

interface CartItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
}

interface BusinessSettings {
  name: string;
  phone?: string;
  address?: string;
  paybillNumber?: string;
  tillNumber?: string;
  accountNumber?: string;
}

interface OrderSuccessData {
  orderNumber: string;
  totalCents: number;
  items: CartItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKES(cents: number) {
  return (cents / 100).toLocaleString('en-KE', { style: 'currency', currency: 'KES' });
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    SUBMITTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    CONFIRMED: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
    PACKED: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    DISPATCHED: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    INVOICED: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    DECLINED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    UNPAID: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    PARTIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    PAID: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  };
  return map[status] ?? 'bg-gray-100 text-gray-600';
}

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${part}, ${name.split(' ')[0]}`;
}

const OFFLINE_QUEUE_KEY = 'agent-offline-queue';

function loadOfflineQueue(): object[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}

function saveOfflineQueue(q: object[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      {label && <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</div>}
      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-right">{pct.toFixed(1)}%</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(status)}`}>
      {status}
    </span>
  );
}

function OrderCard({ order, onClick }: { order: FieldOrderSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm text-gray-900 dark:text-white">{order.orderNumber}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{order.customerName} · {order.shopCode}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-semibold text-sm text-gray-900 dark:text-white">{fmtKES(order.totalCents)}</div>
          <div className="text-xs text-gray-400 mt-0.5">{new Date(order.createdAt).toLocaleDateString('en-KE')}</div>
        </div>
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <StatusBadge status={order.status} />
        <StatusBadge status={order.paymentStatus} />
        {order.invoiceNumber && (
          <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">
            INV: {order.invoiceNumber}
          </span>
        )}
      </div>
    </button>
  );
}

function buildOrderDetailMessage(
  biz: BusinessSettings,
  order: FieldOrderDetail,
  paymentNote: string,
): string {
  const date = new Date(order.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  const itemLines = order.items
    .map(i => `  • ${i.itemName} x${i.quantity}  ${fmtKES(i.totalCents)}`)
    .join('\n');
  let msg = `🏢 *${biz.name}*\n`;
  msg += `📋 *ORDER CONFIRMATION*\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `Order No: *${order.orderNumber}*\n`;
  msg += `Date: ${date}\n`;
  msg += `Customer: ${order.customerName}\n`;
  msg += `Shop Code: ${order.shopCode}\n`;
  msg += `Status: ${order.status}\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `*Items:*\n${itemLines}\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `*Total: ${fmtKES(order.totalCents)}*\n`;
  if (paymentNote.trim()) {
    msg += `\n💳 *Payment Details:*\n${paymentNote.trim()}\n`;
  }
  msg += `\nThank you for your business!\n`;
  if (biz.phone) msg += `📞 ${biz.phone}`;
  return msg;
}

function OrderDetailModal({
  order,
  businessId,
  onClose,
}: {
  order: FieldOrderDetail;
  businessId: string;
  onClose: () => void;
}) {
  const [showShare, setShowShare] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [editMsg, setEditMsg] = useState('');
  const [editing, setEditing] = useState(false);

  const { data: settings } = useQuery<BusinessSettings>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    staleTime: 5 * 60_000,
    enabled: showShare,
  });

  const biz: BusinessSettings = settings ?? { name: 'Our Company' };

  // Pre-fill payment note from business settings when they load
  const defaultPayment = [
    biz.paybillNumber ? `Paybill: ${biz.paybillNumber}${biz.accountNumber ? `\nAccount: ${biz.accountNumber}` : ''}` : '',
    biz.tillNumber ? `Till No: ${biz.tillNumber}` : '',
  ].filter(Boolean).join('\n');

  const builtMsg = buildOrderDetailMessage(biz, order, paymentNote || defaultPayment);
  const finalMsg = editing ? editMsg : builtMsg;
  const phone = order.customerPhone?.replace(/\D/g, '') ?? '';
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(finalMsg)}`;
  const smsUrl = phone
    ? `sms:+${phone}?body=${encodeURIComponent(finalMsg)}`
    : `sms:?body=${encodeURIComponent(finalMsg)}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <div>
            <div className="font-bold text-gray-900 dark:text-white">{order.orderNumber}</div>
            <div className="text-xs text-gray-500 mt-0.5">{order.customerName} · {order.shopCode}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status */}
          <div className="flex gap-2 flex-wrap">
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} />
            {order.isSampleOrder && <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-2 py-0.5 rounded-full">Sample</span>}
          </div>

          {/* Order progress timeline */}
          {(() => {
            const steps = ['SUBMITTED', 'CONFIRMED', 'PACKED', 'DISPATCHED', 'DELIVERED'];
            const currentIdx = steps.indexOf(order.status);
            return (
              <div className="flex items-center gap-1">
                {steps.map((step, i) => {
                  const done = i <= currentIdx;
                  const active = i === currentIdx;
                  return (
                    <div key={step} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          done ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                        } ${active ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                          {done ? '✓' : i + 1}
                        </div>
                        <div className={`text-[9px] mt-0.5 text-center leading-tight ${
                          done ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-400'
                        }`}>{step.charAt(0) + step.slice(1).toLowerCase()}</div>
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`h-0.5 flex-1 mb-3 ${
                          i < currentIdx ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        }`} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Invoice info — shown when office has generated an invoice */}
          {order.invoiceNumber && (
            <div className="flex items-start gap-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-xl p-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-700 dark:text-purple-300 text-sm font-bold">✓</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Invoice Generated by Office</p>
                <p className="text-sm font-mono font-bold text-purple-800 dark:text-purple-300">{order.invoiceNumber}</p>
                {order.invoicedAt && <p className="text-xs text-purple-500">{new Date(order.invoicedAt).toLocaleDateString('en-KE')}</p>}
                {order.paidAmountCents !== undefined && order.paidAmountCents > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Paid: {fmtKES(order.paidAmountCents)} of {fmtKES(order.totalCents)}</p>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div>
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Items</div>
            <div className="space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.itemName} × {item.quantity}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmtKES(item.totalCents)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex justify-between">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Total</span>
            <span className="font-bold text-lg text-gray-900 dark:text-white">{fmtKES(order.totalCents)}</span>
          </div>

          {order.notes && (
            <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <span className="font-medium">Notes: </span>{order.notes}
            </div>
          )}
          {order.routeName && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <MapPin className="w-4 h-4" /> {order.routeName}
            </div>
          )}

          {/* Share section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              onClick={() => setShowShare(v => !v)}
              className="w-full flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-300 py-1"
            >
              <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-green-500" /> Share / Resend</span>
              <ChevronRight className={`w-4 h-4 transition-transform ${showShare ? 'rotate-90' : ''}`} />
            </button>

            {showShare && (
              <div className="mt-3 space-y-3">
                {/* Payment note */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Payment Details (optional)</p>
                  <textarea
                    rows={2}
                    className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Paybill: 247247\nAccount: 0712345678`}
                    value={paymentNote || defaultPayment}
                    onChange={e => { setPaymentNote(e.target.value); setEditing(false); }}
                  />
                </div>

                {/* Message preview */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Message Preview</span>
                    <button
                      onClick={() => { if (!editing) { setEditMsg(builtMsg); } setEditing(v => !v); }}
                      className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline"
                    >
                      <Edit2 className="w-3 h-3" /> {editing ? 'Auto' : 'Edit'}
                    </button>
                  </div>
                  {editing ? (
                    <textarea
                      rows={10}
                      className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none focus:outline-none"
                      value={editMsg}
                      onChange={e => setEditMsg(e.target.value)}
                    />
                  ) : (
                    <pre className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                      {builtMsg}
                    </pre>
                  )}
                </div>

                {/* Share buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </a>
                  <a
                    href={smsUrl}
                    className="min-h-[44px] bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" /> SMS
                  </a>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(finalMsg).then(() => toast.success('Copied!'))}
                  className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" /> Copy Message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── New Customer Modal ────────────────────────────────────────────────────────

function NewCustomerModal({
  routes,
  agentId,
  businessId,
  onClose,
  onCreated,
}: {
  routes: SalesRoute[];
  agentId: string;
  businessId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [shopType, setShopType] = useState('RETAIL');
  const [routeId, setRouteId] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post('/field-sales/customers', { name, phone, kraPin: kraPin || undefined, shopType, routeId: routeId || undefined, gpsLat, gpsLng, agentId, businessId }),
    onSuccess: () => { toast.success('Customer registered'); onCreated(); onClose(); },
    onError: () => toast.error('Failed to register customer'),
  });

  function useGPS() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); setLocating(false); toast.success('Location captured'); },
      () => { setLocating(false); toast.error('Location unavailable'); },
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-bold text-gray-900 dark:text-white">New Customer</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <input className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" placeholder="Shop / Customer Name *" value={name} onChange={e => setName(e.target.value)} />
          <input className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" placeholder="Phone *" value={phone} onChange={e => setPhone(e.target.value)} />
          <input className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono" placeholder="KRA PIN (optional, e.g. A012345678Z)" value={kraPin} onChange={e => setKraPin(e.target.value.toUpperCase())} />
          <select className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" value={shopType} onChange={e => setShopType(e.target.value)}>
            <option value="RETAIL">Retail Shop</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="KIOSK">Kiosk</option>
            <option value="SUPERMARKET">Supermarket</option>
          </select>
          {routes.length > 0 && (
            <select className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" value={routeId} onChange={e => setRouteId(e.target.value)}>
              <option value="">-- Select Route (optional) --</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <button onClick={useGPS} disabled={locating} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 min-h-[44px] px-3 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
            <Navigation className="w-4 h-4" />
            {locating ? 'Getting location...' : gpsLat ? `GPS: ${gpsLat.toFixed(4)}, ${gpsLng?.toFixed(4)}` : 'Use My Location (optional)'}
          </button>
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button onClick={() => mutate()} disabled={!name || !phone || isPending} className="w-full min-h-[44px] bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors">
            {isPending ? 'Registering...' : 'Register Customer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Order Panel ───────────────────────────────────────────────────────────

function NewOrderPanel({
  customer,
  agentId,
  businessId,
  lastOrderItems,
  onSuccess,
}: {
  customer: FieldCustomer;
  agentId: string;
  businessId: string;
  lastOrderItems: CartItem[];
  onSuccess: (data: OrderSuccessData) => void;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isSampleOrder, setIsSampleOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['agent-items', businessId, search],
    queryFn: () => api.get(`/items?businessId=${businessId}&activeOnly=true&search=${encodeURIComponent(search)}&limit=30`),
    staleTime: 60_000,
  });

  const subtotal = cart.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const totalCents = subtotal; // VAT is calculated server-side based on business tax settings
  const exceedsCredit = customer.creditLimitCents > 0 && totalCents > customer.creditLimitCents;

  function addItem(item: InventoryItem) {
    setCart(prev => {
      const idx = prev.findIndex(c => c.itemId === item.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { itemId: item.id, itemName: item.name, quantity: 1, unitPriceCents: item.retailPriceCents }];
    });
  }

  function removeItem(itemId: string) {
    setCart(prev => prev.filter(c => c.itemId !== itemId));
  }

  function updateQty(itemId: string, qty: number) {
    if (qty <= 0) { removeItem(itemId); return; }
    setCart(prev => prev.map(c => c.itemId === itemId ? { ...c, quantity: qty } : c));
  }

  function repeatLastOrder() {
    setCart(lastOrderItems.map(i => ({ ...i })));
    toast.success('Last order items loaded');
  }

  async function submitOrder() {
    if (cart.length === 0) { toast.error('Add at least one item'); return; }
    setSubmitting(true);
    const payload = {
      customerId: customer.id,
      agentId,
      businessId,
      routeId: customer.routeId,
      items: cart.map(c => ({ itemId: c.itemId, itemName: c.itemName, quantity: c.quantity, unitPriceCents: c.unitPriceCents })),
      notes: notes || undefined,
      isSampleOrder,
    };

    if (!navigator.onLine) {
      const queue = loadOfflineQueue();
      queue.push(payload);
      saveOfflineQueue(queue);
      toast.warning('Saved offline. Will sync when connected.');
      setSubmitting(false);
      onSuccess({ orderNumber: 'OFFLINE-' + Date.now(), totalCents, items: [...cart] });
      return;
    }

    try {
      const res = await api.post<{ orderNumber: string }>('/field-sales/orders', payload);
      qc.invalidateQueries({ queryKey: ['agent-orders'] });
      qc.invalidateQueries({ queryKey: ['agent-stats'] });
      const snapshot = [...cart];
      setCart([]);
      setNotes('');
      onSuccess({ orderNumber: res.orderNumber, totalCents, items: snapshot });
    } catch (err: unknown) {
      const e = err as { code?: string; available?: number; requested?: number; itemName?: string };
      if (e?.code === 'INSUFFICIENT_STOCK') {
        toast.error(`Not enough stock for "${e.itemName}". Available: ${e.available}, you ordered: ${e.requested}`);
      } else if (e?.code === 'CREDIT_LIMIT_EXCEEDED') {
        if (confirm('Credit limit exceeded. Submit a credit increase request?')) {
          await api.post('/field-sales/credit-requests', { customerId: customer.id, businessId, requestedBy: agentId, fieldOrderId: null, currentLimitCents: customer.creditLimitCents, requestedLimitCents: customer.creditLimitCents * 2 });
          toast.success('Credit increase request submitted');
        }
      } else {
        toast.error('Failed to submit order');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const unusedLastItems = lastOrderItems.filter(li => !cart.some(c => c.itemId === li.itemId));

  return (
    <div className="space-y-4">
      {lastOrderItems.length > 0 && (
        <button onClick={repeatLastOrder} className="w-full min-h-[44px] border-2 border-dashed border-blue-400 dark:border-blue-600 text-blue-600 dark:text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
          Repeat Last Order ({lastOrderItems.length} items)
        </button>
      )}

      {exceedsCredit && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Order ({fmtKES(totalCents)}) exceeds credit limit ({fmtKES(customer.creditLimitCents)}). Submit anyway to request approval.</span>
        </div>
      )}

      {/* Item Search */}
      <div>
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Add Items</div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
          {items.slice(0, 20).map(item => {
            const cartQty = cart.find(c => c.itemId === item.id)?.quantity ?? 0;
            const lowStock = item.quantity > 0 && item.quantity <= 5;
            const outOfStock = item.quantity <= 0;
            return (
              <button key={item.id} onClick={() => !outOfStock && addItem(item)} disabled={outOfStock} className={`text-left p-2.5 rounded-lg border transition-colors ${
                outOfStock ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}>
                <div className="text-xs font-medium text-gray-900 dark:text-white truncate">{item.name}</div>
                <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{fmtKES(item.retailPriceCents)}</div>
                <div className={`text-xs mt-0.5 ${outOfStock ? 'text-red-500' : lowStock ? 'text-amber-500' : 'text-gray-400'}`}>
                  {outOfStock ? 'Out of stock' : `Stk: ${item.quantity}${cartQty > 0 ? ` (${cartQty} in cart)` : ''}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Suggestions from last visit */}
      {unusedLastItems.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">From Last Visit</div>
          <div className="flex flex-wrap gap-2">
            {unusedLastItems.map(li => (
              <button key={li.itemId} onClick={() => setCart(prev => [...prev, { ...li, quantity: 1 }])} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 transition-colors min-h-[32px]">
                + {li.itemName}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cart */}
      {cart.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Cart ({cart.length})</div>
          <div className="space-y-2">
            {cart.map(item => (
              <div key={item.itemId} className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.itemName}</div>
                  <div className="text-xs text-gray-500">{fmtKES(item.unitPriceCents)} each</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => updateQty(item.itemId, item.quantity - 1)} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600">−</button>
                  <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-white">{item.quantity}</span>
                  <button onClick={() => updateQty(item.itemId, item.quantity + 1)} className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-bold text-sm hover:bg-gray-200 dark:hover:bg-gray-600">+</button>
                </div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white w-20 text-right">{fmtKES(item.unitPriceCents * item.quantity)}</div>
                <button onClick={() => removeItem(item.itemId)} className="p-1 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between font-bold text-base text-gray-900 dark:text-white border-t border-gray-200 dark:border-gray-700 pt-2">
              <span>Total</span><span>{fmtKES(totalCents)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Notes & options */}
      <textarea className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white resize-none" rows={2} placeholder="Order notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

      <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
        <div onClick={() => setIsSampleOrder(!isSampleOrder)} className={`w-10 h-6 rounded-full transition-colors ${isSampleOrder ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isSampleOrder ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
        <span className="text-sm text-gray-700 dark:text-gray-300">Mark as Sample Order</span>
      </label>

      <button onClick={submitOrder} disabled={cart.length === 0 || submitting} className="w-full min-h-[48px] bg-blue-600 text-white rounded-xl font-bold text-base disabled:opacity-50 hover:bg-blue-700 transition-colors">
        {submitting ? 'Submitting...' : `Submit Order · ${fmtKES(totalCents)}`}
      </button>
    </div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function HomeScreen({ user, businessId, onNavigate }: { user: { id: string; name: string }; businessId: string; onNavigate: (s: Screen) => void }) {
  const now = new Date();
  const { data: stats, isLoading, refetch } = useQuery<AgentStats>({
    queryKey: ['agent-stats', user.id, businessId, now.getMonth(), now.getFullYear()],
    queryFn: () => api.get(`/field-sales/agent-stats?agentId=${user.id}&businessId=${businessId}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`),
    staleTime: 2 * 60_000,
  });

  const { data: pendingCredits = [] } = useQuery<CreditRequest[]>({
    queryKey: ['agent-credit-requests', user.id, businessId],
    queryFn: () => api.get(`/field-sales/credit-requests?agentId=${user.id}&businessId=${businessId}&status=PENDING`),
    staleTime: 60_000,
  });

  return (
    <div className="p-4 space-y-4">
      {/* Greeting */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{greeting(user.name)}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your sales dashboard</p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><RefreshCw className="w-5 h-5 text-gray-500" /></button>
      </div>

      {/* Pending credit banner */}
      {pendingCredits.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 rounded-xl p-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-200">{pendingCredits.length} credit increase request{pendingCredits.length > 1 ? 's' : ''} pending approval</span>
        </div>
      )}

      {/* Today's stats */}
      {isLoading ? (
        <div className="h-24 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
      ) : (
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-4 text-white">
          <div className="text-xs font-medium opacity-80 uppercase tracking-wide mb-3">Today</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-3xl font-bold">{stats?.ordersToday ?? 0}</div>
              <div className="text-xs opacity-80 mt-0.5">Orders Submitted</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{fmtKES(stats?.valueTodayCents ?? 0)}</div>
              <div className="text-xs opacity-80 mt-0.5">Total Value</div>
            </div>
          </div>
        </div>
      )}

      {/* Commission progress */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">Monthly Commission</span>
            <span className="text-xs text-gray-500">{stats.daysLeftInMonth}d left</span>
          </div>
          <ProgressBar
            value={stats.valueThisMonthCents}
            max={stats.commissionTargetCents}
            label={`${fmtKES(stats.valueThisMonthCents)} / ${fmtKES(stats.commissionTargetCents)} target`}
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Commission earned: <span className="font-semibold text-green-600 dark:text-green-400">{fmtKES(stats.commissionEarnedCents)}</span></span>
            {stats.daysLeftInMonth > 0 && stats.commissionTargetCents > stats.valueThisMonthCents && (
              <span>Daily target: {fmtKES(Math.ceil((stats.commissionTargetCents - stats.valueThisMonthCents) / stats.daysLeftInMonth))}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Find Customer', icon: Search, screen: 'customers' as Screen, color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
          { label: 'New Customer', icon: Plus, screen: 'customers' as Screen, color: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
          { label: 'View Orders', icon: ClipboardList, screen: 'order-history' as Screen, color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
          { label: 'Call Plan', icon: MapPin, screen: 'call-plan' as Screen, color: 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' },
          { label: 'Credit Collection', icon: AlertTriangle, screen: 'credit-collection' as Screen, color: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
          { label: 'Leaderboard', icon: TrendingUp, screen: 'leaderboard' as Screen, color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
        ].map(action => (
          <button key={action.label} onClick={() => onNavigate(action.screen)} className={`${action.color} rounded-2xl p-4 text-left hover:opacity-80 transition-opacity min-h-[80px]`}>
            <action.icon className="w-6 h-6 mb-2" />
            <div className="font-semibold text-sm">{action.label}</div>
          </button>
        ))}
      </div>

      {/* Recent orders */}
      {stats?.recentOrders && stats.recentOrders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-gray-900 dark:text-white">Recent Orders</span>
            <button onClick={() => onNavigate('order-history')} className="text-xs text-blue-600 dark:text-blue-400">View all</button>
          </div>
          <div className="space-y-2">
            {stats.recentOrders.slice(0, 5).map(order => (
              <OrderCard key={order.id} order={order} onClick={() => {}} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomersScreen({
  agentId,
  businessId,
  onSelectCustomer,
}: {
  agentId: string;
  businessId: string;
  onSelectCustomer: (c: FieldCustomer) => void;
}) {
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const qc = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<FieldCustomer[]>({
    queryKey: ['agent-customers', agentId, businessId, search],
    queryFn: () => api.get(`/field-sales/customers?businessId=${businessId}&agentId=${agentId}&search=${encodeURIComponent(search)}`),
    staleTime: 60_000,
  });

  const { data: routes = [] } = useQuery<SalesRoute[]>({
    queryKey: ['sales-routes', businessId],
    queryFn: () => api.get(`/field-sales/routes?businessId=${businessId}`),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>}

      {!isLoading && customers.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'No customers found' : 'No customers yet'}</p>
        </div>
      )}

      <div className="space-y-2">
        {customers.map(c => (
          <button key={c.id} onClick={() => onSelectCustomer(c)} className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white">{c.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.shopCode} · <Phone className="w-3 h-3 inline" /> {c.phone}</div>
                {c.routeName && <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><MapPin className="w-3 h-3" />{c.routeName}</div>}
              </div>
              <div className="text-right">
                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{c.shopType}</span>
                {c.outstandingCents > 0 && <div className="text-xs text-red-500 mt-1">Owes {fmtKES(c.outstandingCents)}</div>}
                {c.lastOrderDate && <div className="text-xs text-gray-400 mt-1">{new Date(c.lastOrderDate).toLocaleDateString('en-KE')}</div>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* FAB */}
      <button onClick={() => setShowNewModal(true)} className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-colors z-40">
        <Plus className="w-6 h-6" />
      </button>

      {showNewModal && (
        <NewCustomerModal routes={routes} agentId={agentId} businessId={businessId} onClose={() => setShowNewModal(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['agent-customers'] })} />
      )}
    </div>
  );
}

// ─── Order Success + WhatsApp Share Panel ────────────────────────────────────

function buildOrderMessage(
  biz: BusinessSettings,
  order: OrderSuccessData,
  customer: FieldCustomer,
  paymentNote: string,
): string {
  const date = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
  const itemLines = order.items
    .map(i => `  • ${i.itemName} x${i.quantity}  ${fmtKES(i.unitPriceCents * i.quantity)}`)
    .join('\n');
  const total = fmtKES(order.totalCents);
  let msg = `🏢 *${biz.name}*\n`;
  msg += `📋 *ORDER CONFIRMATION*\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `Order No: *${order.orderNumber}*\n`;
  msg += `Date: ${date}\n`;
  msg += `Customer: ${customer.name}\n`;
  msg += `Shop Code: ${customer.shopCode}\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `*Items:*\n${itemLines}\n`;
  msg += `${'─'.repeat(30)}\n`;
  msg += `*Total: ${total}*\n`;
  if (paymentNote.trim()) {
    msg += `\n💳 *Payment Details:*\n${paymentNote.trim()}\n`;
  }
  msg += `\nThank you for your order! Our team will process and deliver it shortly.\n`;
  if (biz.phone) msg += `\n📞 ${biz.phone}`;
  return msg;
}

function OrderSuccessPanel({
  order,
  customer,
  businessId,
  onDone,
}: {
  order: OrderSuccessData;
  customer: FieldCustomer;
  businessId: string;
  onDone: () => void;
}) {
  const { data: settings } = useQuery<BusinessSettings>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    staleTime: 5 * 60_000,
  });

  const biz: BusinessSettings = settings ?? { name: 'Our Company' };

  const defaultPayment = [
    biz.paybillNumber ? `Paybill: ${biz.paybillNumber}${biz.accountNumber ? `\nAccount: ${biz.accountNumber}` : ''}` : '',
    biz.tillNumber ? `Till No: ${biz.tillNumber}` : '',
  ].filter(Boolean).join('\n');

  const [paymentNote, setPaymentNote] = useState(defaultPayment);
  const [msgBody, setMsgBody] = useState('');
  const [editing, setEditing] = useState(false);

  // Build message whenever deps change
  const builtMsg = buildOrderMessage(biz, order, customer, paymentNote);

  const waUrl = `https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(editing ? msgBody : builtMsg)}`;

  function startEdit() {
    setMsgBody(builtMsg);
    setEditing(true);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Success header */}
      <div className="flex flex-col items-center text-center py-4 space-y-2">
        <CheckCircle className="w-14 h-14 text-green-500" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Order Submitted!</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          <span className="font-mono font-semibold text-gray-800 dark:text-white">{order.orderNumber}</span>
          {' · '}
          <span className="font-semibold text-blue-600 dark:text-blue-400">{fmtKES(order.totalCents)}</span>
        </p>
      </div>

      {/* Payment details editor */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Payment Details (shown in message)</p>
        <textarea
          rows={3}
          className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Paybill: 247247&#10;Account: 0712345678&#10;Till No: 123456"
          value={paymentNote}
          onChange={e => { setPaymentNote(e.target.value); setEditing(false); }}
        />
      </div>

      {/* Message preview / edit */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp Message Preview
          </span>
          <button onClick={editing ? () => setEditing(false) : startEdit} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
            <Edit2 className="w-3 h-3" /> {editing ? 'Auto' : 'Edit'}
          </button>
        </div>
        {editing ? (
          <textarea
            rows={14}
            className="w-full px-3 py-3 text-xs font-mono bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 resize-none focus:outline-none"
            value={msgBody}
            onChange={e => setMsgBody(e.target.value)}
          />
        ) : (
          <pre className="px-3 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
            {builtMsg}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-[48px] bg-green-500 text-white rounded-xl font-bold text-sm hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle className="w-5 h-5" /> Share Order via WhatsApp
        </a>
        <button
          onClick={() => {
            const text = editing ? msgBody : builtMsg;
            navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
          }}
          className="w-full min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" /> Copy Message
        </button>
        <button onClick={onDone} className="w-full text-blue-600 dark:text-blue-400 text-sm py-2 hover:underline">
          Back to Customer
        </button>
      </div>
    </div>
  );
}

// ─── Customer Detail ──────────────────────────────────────────────────────────

function CustomerDetailScreen({
  customer,
  agentId,
  businessId,
}: {
  customer: FieldCustomer;
  agentId: string;
  businessId: string;
}) {
  const [tab, setTab] = useState<CustomerTab>('history');
  const [selectedOrder, setSelectedOrder] = useState<FieldOrderDetail | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<OrderSuccessData | null>(null);

  const { data: history = [], isLoading } = useQuery<FieldOrderDetail[]>({
    queryKey: ['customer-history', customer.id, agentId],
    queryFn: () => api.get(`/field-sales/customers/${customer.id}/history?businessId=${businessId}&agentId=${agentId}`),
    staleTime: 60_000,
  });

  const usualItems = (() => {
    const freq: Record<string, { item: CartItem; count: number }> = {};
    history.forEach(order => order.items.forEach(item => {
      if (!freq[item.itemName]) freq[item.itemName] = { item: { itemId: '', itemName: item.itemName, quantity: item.quantity, unitPriceCents: item.unitPriceCents }, count: 0 };
      freq[item.itemName].count++;
    }));
    return Object.values(freq).filter(f => f.count >= 3).map(f => f.item);
  })();

  const lastOrderItems: CartItem[] = history[0]?.items.map(i => ({ itemId: '', itemName: i.itemName, quantity: i.quantity, unitPriceCents: i.unitPriceCents })) ?? [];

  function handleOrderSuccess(data: OrderSuccessData) {
    setOrderSuccess(data);
    setTab('history');
  }

  if (orderSuccess) {
    return (
      <OrderSuccessPanel
        order={orderSuccess}
        customer={customer}
        businessId={businessId}
        onDone={() => setOrderSuccess(null)}
      />
    );
  }

  return (
    <div>
      {/* Customer header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{customer.name[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 dark:text-white truncate">{customer.name}</h2>
            <div className="text-xs text-gray-500 mt-0.5">{customer.shopCode} · {customer.shopType}</div>
            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs text-gray-500">Credit limit</div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">{fmtKES(customer.creditLimitCents)}</div>
            {customer.outstandingCents > 0 && <div className="text-xs text-red-500">Owes {fmtKES(customer.outstandingCents)}</div>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {(['history', 'new-order'] as CustomerTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
            {t === 'history' ? 'Order History' : 'New Order'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'history' && (
          <div className="space-y-3">
            {usualItems.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Usual Items</div>
                <div className="flex flex-wrap gap-2">
                  {usualItems.map(item => (
                    <span key={item.itemName} className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full">{item.itemName}</span>
                  ))}
                </div>
              </div>
            )}
            {isLoading && <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>}
            {!isLoading && history.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No orders yet</p>
              </div>
            )}
            {history.map(order => <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />)}
          </div>
        )}
        {tab === 'new-order' && (
          <NewOrderPanel customer={customer} agentId={agentId} businessId={businessId} lastOrderItems={lastOrderItems} onSuccess={(data) => handleOrderSuccess(data)} />
        )}
      </div>

      {selectedOrder && <OrderDetailModal order={selectedOrder} businessId={businessId} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

function OrderHistoryScreen({ agentId, businessId }: { agentId: string; businessId: string }) {
  type Filter = 'all' | 'today' | 'week' | 'pending';
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedOrder, setSelectedOrder] = useState<FieldOrderDetail | null>(null);

  const { data: orders = [], isLoading, refetch } = useQuery<FieldOrderDetail[]>({
    queryKey: ['agent-orders', agentId, businessId, filter],
    queryFn: () => api.get(`/field-sales/orders?businessId=${businessId}&agentId=${agentId}&filter=${filter}`),
    staleTime: 60_000,
  });

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'Pending', value: 'pending' },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 dark:text-white">My Orders</h2>
        <button onClick={() => refetch()} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
      </div>
      <div className="flex gap-2 overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap pb-1">
        {filters.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)} className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[36px] ${filter === f.value ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
            {f.label}
          </button>
        ))}
      </div>
      {isLoading && <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>}
      {!isLoading && orders.length === 0 && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No orders found</p>
        </div>
      )}
      <div className="space-y-2">
        {orders.map(order => <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />)}
      </div>
      {selectedOrder && <OrderDetailModal order={selectedOrder} businessId={businessId} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

function MyStatsScreen({ agentId, businessId }: { agentId: string; businessId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  const { data: stats, isLoading } = useQuery<AgentStats & { ordersDelivered: number }>({
    queryKey: ['agent-stats', agentId, businessId, month, year],
    queryFn: () => api.get(`/field-sales/agent-stats?agentId=${agentId}&businessId=${businessId}&month=${month}&year=${year}`),
    staleTime: 2 * 60_000,
  });

  const { data: creditRequests = [] } = useQuery<CreditRequest[]>({
    queryKey: ['agent-credit-requests', agentId, businessId],
    queryFn: () => api.get(`/field-sales/credit-requests?agentId=${agentId}&businessId=${businessId}`),
    staleTime: 60_000,
  });

  const monthName = new Date(year, month - 1).toLocaleString('en-KE', { month: 'long', year: 'numeric' });

  return (
    <div className="p-4 space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
        <button onClick={prevMonth} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px] min-w-[44px] flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
        <span className="font-semibold text-gray-900 dark:text-white">{monthName}</span>
        <button onClick={nextMonth} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 min-h-[44px] min-w-[44px] flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
      </div>

      {isLoading && <div className="space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />)}</div>}

      {stats && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Orders Submitted', value: stats.ordersThisMonth, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'Orders Delivered', value: stats.ordersDelivered ?? 0, color: 'text-green-600 dark:text-green-400' },
              { label: 'Total Value', value: fmtKES(stats.valueThisMonthCents), color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Commission', value: fmtKES(stats.commissionEarnedCents), color: 'text-amber-600 dark:text-amber-400' },
            ].map(card => (
              <div key={card.label} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Target progress */}
          {stats.commissionTargetCents > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <div className="font-semibold text-sm text-gray-900 dark:text-white">Sales Target Progress</div>
              <ProgressBar value={stats.valueThisMonthCents} max={stats.commissionTargetCents} />
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">{fmtKES(stats.commissionEarnedCents)}</div>
                  <div className="text-gray-500">Commission earned</div>
                </div>
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">{stats.daysLeftInMonth}</div>
                  <div className="text-gray-500">Days left</div>
                </div>
                <div>
                  <div className="font-bold text-gray-900 dark:text-white">
                    {stats.daysLeftInMonth > 0 && stats.commissionTargetCents > stats.valueThisMonthCents
                      ? fmtKES(Math.ceil((stats.commissionTargetCents - stats.valueThisMonthCents) / stats.daysLeftInMonth))
                      : '—'}
                  </div>
                  <div className="text-gray-500">Daily target</div>
                </div>
              </div>
            </div>
          )}

          {/* Credit requests */}
          {creditRequests.length > 0 && (
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-white mb-2">My Credit Requests</div>
              <div className="space-y-2">
                {creditRequests.map(cr => (
                  <div key={cr.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{fmtKES(cr.requestedLimitCents)} limit request</div>
                      <div className="text-xs text-gray-500">{new Date(cr.createdAt).toLocaleDateString('en-KE')}</div>
                    </div>
                    <StatusBadge status={cr.status} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Call Plan Screen ─────────────────────────────────────────────────────────

interface CallPlanCustomer {
  id: string; name: string; phone: string | null; shopCode: string | null; shopType: string | null;
  outstandingCents: number; creditLimitCents: number; gpsLat: number | null; gpsLng: number | null;
  lastVisit: string | null; lastVisitOutcome: string | null; daysSinceVisit: number | null;
  pendingOrder: { id: string; orderNumber: string; totalCents: number; paidAmountCents: number; status: string } | null;
  totalOrders: number; priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
}

function CallPlanScreen({ agentId, businessId }: { agentId: string; businessId: string }) {
  const [logVisitCustomer, setLogVisitCustomer] = useState<CallPlanCustomer | null>(null);
  const qc = useQueryClient();

  const { data: plan = [], isLoading, refetch } = useQuery<CallPlanCustomer[]>({
    queryKey: ['call-plan', agentId, businessId],
    queryFn: () => api.get(`/field-sales/call-plan?agentId=${agentId}&businessId=${businessId}`),
    staleTime: 60_000,
  });

  const priorityColor = (p: string) => p === 'HIGH' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : p === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Today's Call Plan</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">{plan.length} customers to visit</p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {isLoading ? <div className="text-center text-gray-400 py-8">Loading...</div> : plan.length === 0 ? (
        <div className="text-center text-gray-400 py-8"><MapPin className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No customers assigned</p></div>
      ) : (
        <div className="space-y-2">
          {plan.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white">{c.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${priorityColor(c.priority)}`}>{c.priority}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{c.shopCode} · {c.shopType}</div>
                </div>
                {c.outstandingCents > 0 && (
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0">Owes {fmtKES(c.outstandingCents)}</span>
                )}
              </div>
              {c.pendingOrder && (
                <div className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-lg">
                  Pending: {c.pendingOrder.orderNumber} — {fmtKES(c.pendingOrder.totalCents - c.pendingOrder.paidAmountCents)} unpaid
                </div>
              )}
              <div className="text-xs text-gray-400">
                {c.daysSinceVisit != null ? `Last visit ${c.daysSinceVisit}d ago (${c.lastVisitOutcome})` : 'Never visited'}
              </div>
              <div className="flex gap-2">
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex-1 min-h-[36px] bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-600">
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                )}
                <button onClick={() => setLogVisitCustomer(c)} className="flex-1 min-h-[36px] bg-blue-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 hover:bg-blue-700">
                  <CheckCircle className="w-3.5 h-3.5" /> Log Visit
                </button>
                {c.gpsLat && c.gpsLng && (
                  <a href={`https://maps.google.com/?q=${c.gpsLat},${c.gpsLng}`} target="_blank" rel="noopener noreferrer" className="min-h-[36px] px-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 hover:bg-green-200">
                    <MapPin className="w-3.5 h-3.5" /> Map
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {logVisitCustomer && (
        <LogVisitModal customer={logVisitCustomer} agentId={agentId} businessId={businessId}
          onClose={() => setLogVisitCustomer(null)}
          onSaved={() => { setLogVisitCustomer(null); qc.invalidateQueries({ queryKey: ['call-plan'] }); toast.success('Visit logged'); }} />
      )}
    </div>
  );
}

function LogVisitModal({ customer, agentId, businessId, onClose, onSaved }: {
  customer: { id: string; name: string }; agentId: string; businessId: string; onClose: () => void; onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState('VISITED');
  const [notes, setNotes] = useState('');
  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/field-sales/customers/${customer.id}/visits?businessId=${businessId}`, { agentId, outcome, notes: notes || undefined }),
    onSuccess: onSaved,
    onError: () => toast.error('Failed to log visit'),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white">Log Visit — {customer.name}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <select value={outcome} onChange={e => setOutcome(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
          <option value="VISITED">Visited</option>
          <option value="ORDERED">Ordered</option>
          <option value="NO_ANSWER">No Answer</option>
          <option value="DECLINED">Declined</option>
          <option value="FOLLOW_UP">Follow Up</option>
        </select>
        <textarea rows={3} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-none" />
        <button onClick={() => mutate()} disabled={isPending} className="w-full min-h-[44px] bg-blue-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-blue-700">
          {isPending ? 'Saving...' : 'Save Visit'}
        </button>
      </div>
    </div>
  );
}

// ─── Credit Collection Screen ─────────────────────────────────────────────────

interface CreditCustomer {
  id: string; name: string; phone: string | null; shopCode: string | null;
  outstandingCents: number; creditLimitCents: number; agingBucket: string; agingDays: number;
  unpaidOrders: Array<{ id: string; orderNumber: string; totalCents: number; paidAmountCents: number; balanceCents: number; agingDays: number; status: string }>;
}

function CreditCollectionScreen({ agentId, businessId }: { agentId: string; businessId: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collectOrder, setCollectOrder] = useState<{ orderId: string; customerName: string; balanceCents: number } | null>(null);
  const qc = useQueryClient();

  const { data: credits = [], isLoading, refetch } = useQuery<CreditCustomer[]>({
    queryKey: ['credit-collection', agentId, businessId],
    queryFn: () => api.get(`/field-sales/credit-collection?agentId=${agentId}&businessId=${businessId}`),
    staleTime: 60_000,
  });

  const totalOutstanding = credits.reduce((s, c) => s + c.outstandingCents, 0);
  const bucketColor = (b: string) => b === '90+' ? 'text-red-600' : b === '61-90' ? 'text-orange-600' : b === '31-60' ? 'text-yellow-600' : 'text-green-600';

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white">Credit Collection</h2>
          <p className="text-xs text-gray-500">{credits.length} customers · {fmtKES(totalOutstanding)} total outstanding</p>
        </div>
        <button onClick={() => refetch()} className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {isLoading ? <div className="text-center text-gray-400 py-8">Loading...</div> : credits.length === 0 ? (
        <div className="text-center py-8"><CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" /><p className="text-gray-500">No outstanding credit</p></div>
      ) : (
        <div className="space-y-2">
          {credits.map(c => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="w-full p-3 flex items-center justify-between text-left">
                <div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.shopCode}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-red-600 dark:text-red-400 text-sm">{fmtKES(c.outstandingCents)}</div>
                  <div className={`text-xs font-semibold ${bucketColor(c.agingBucket)}`}>{c.agingBucket} days</div>
                </div>
              </button>
              {expanded === c.id && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-2">
                  {c.unpaidOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium text-gray-800 dark:text-gray-200">{o.orderNumber}</div>
                        <div className="text-xs text-gray-400">{o.agingDays}d old · {o.status}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-600 dark:text-red-400 text-xs">{fmtKES(o.balanceCents)}</span>
                        <button onClick={() => setCollectOrder({ orderId: o.id, customerName: c.name, balanceCents: o.balanceCents })} className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-lg font-semibold hover:bg-green-200">Collect</button>
                      </div>
                    </div>
                  ))}
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline"><Phone className="w-3.5 h-3.5" /> Call {c.phone}</a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {collectOrder && (
        <CollectPaymentModal
          orderId={collectOrder.orderId}
          customerName={collectOrder.customerName}
          balanceCents={collectOrder.balanceCents}
          agentId={agentId}
          businessId={businessId}
          onClose={() => setCollectOrder(null)}
          onSaved={() => { setCollectOrder(null); qc.invalidateQueries({ queryKey: ['credit-collection'] }); toast.success('Payment recorded'); }}
        />
      )}
    </div>
  );
}

function CollectPaymentModal({ orderId, customerName, balanceCents, agentId, businessId, onClose, onSaved }: {
  orderId: string; customerName: string; balanceCents: number; agentId: string; businessId: string; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(balanceCents / 100));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/field-sales/orders/${orderId}/collect-payment?businessId=${businessId}`, {
      amountCents: Math.round(Number(amount) * 100),
      method,
      reference: reference || undefined,
      collectedBy: agentId,
    }),
    onSuccess: onSaved,
    onError: () => toast.error('Failed to record payment'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 dark:text-white">Collect Payment</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{customerName} · Balance: <span className="font-bold text-red-600">{fmtKES(balanceCents)}</span></p>
        <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden">
          <span className="px-3 bg-gray-50 dark:bg-gray-700 text-gray-500 border-r border-gray-300 dark:border-gray-600 py-2.5 text-sm">KES</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1 px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none" placeholder="Amount" />
        </div>
        <select value={method} onChange={e => setMethod(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm">
          <option value="CASH">Cash</option>
          <option value="MPESA">M-Pesa</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="CHEQUE">Cheque</option>
        </select>
        {(method === 'MPESA' || method === 'BANK_TRANSFER' || method === 'CHEQUE') && (
          <input placeholder={method === 'MPESA' ? 'M-Pesa Reference' : method === 'CHEQUE' ? 'Cheque No.' : 'Transaction Ref'} value={reference} onChange={e => setReference(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
        )}
        <button onClick={() => mutate()} disabled={isPending || !amount || Number(amount) <= 0} className="w-full min-h-[44px] bg-green-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-green-700">
          {isPending ? 'Recording...' : `Record ${fmtKES(Math.round(Number(amount) * 100))} Payment`}
        </button>
      </div>
    </div>
  );
}

// ─── Leaderboard Screen ───────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number; agentId: string; agentName: string; avatarUrl: string | null;
  ordersCount: number; totalValueCents: number; commissionCents: number; visitCount: number;
}

function LeaderboardScreen({ agentId, businessId }: { agentId: string; businessId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: board = [], isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', businessId, month, year],
    queryFn: () => api.get(`/field-sales/leaderboard?businessId=${businessId}&month=${month}&year=${year}`),
    staleTime: 5 * 60_000,
  });

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const medalColor = (r: number) => r === 1 ? 'text-yellow-500' : r === 2 ? 'text-gray-400' : r === 3 ? 'text-amber-600' : 'text-gray-500';
  const isMe = (id: string) => id === agentId;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 dark:text-white">Sales Leaderboard</h2>
        <div className="flex gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
            {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? <div className="text-center text-gray-400 py-8">Loading...</div> : board.length === 0 ? (
        <div className="text-center text-gray-400 py-8"><TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>No data yet</p></div>
      ) : (
        <div className="space-y-2">
          {board.map(entry => (
            <div key={entry.agentId} className={`bg-white dark:bg-gray-800 rounded-xl border p-3 ${isMe(entry.agentId) ? 'border-blue-400 dark:border-blue-500 ring-1 ring-blue-400' : 'border-gray-200 dark:border-gray-700'}`}>
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-black w-8 text-center ${medalColor(entry.rank)}`}>{entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : `#${entry.rank}`}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{entry.agentName}</span>
                    {isMe(entry.agentId) && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-bold">YOU</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{entry.ordersCount} orders · {entry.visitCount} visits</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900 dark:text-white text-sm">{fmtKES(entry.totalValueCents)}</div>
                  <div className="text-xs text-green-600 dark:text-green-400">+{fmtKES(entry.commissionCents)} comm.</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentPage() {
  const user = useAuthStore(s => s.user);
  const businessId = user?.businessId ?? '';
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCustomer, setSelectedCustomer] = useState<FieldCustomer | null>(null);

  // Sync offline queue on reconnect
  useEffect(() => {
    async function syncQueue() {
      const queue = loadOfflineQueue();
      if (queue.length === 0) return;
      const remaining: object[] = [];
      for (const payload of queue) {
        try {
          await api.post('/field-sales/orders', payload);
        } catch {
          remaining.push(payload);
        }
      }
      if (remaining.length < queue.length) {
        saveOfflineQueue(remaining);
        toast.success(`Synced ${queue.length - remaining.length} offline order(s)`);
      }
    }
    window.addEventListener('online', syncQueue);
    syncQueue();
    return () => window.removeEventListener('online', syncQueue);
  }, []);

  if (!user) return null;

  const TAB_ITEMS = [
    { screen: 'home' as Screen, icon: Home, label: 'Home' },
    { screen: 'customers' as Screen, icon: Users, label: 'Customers' },
    { screen: 'order-history' as Screen, icon: ClipboardList, label: 'Orders' },
    { screen: 'call-plan' as Screen, icon: MapPin, label: 'Plan' },
    { screen: 'my-stats' as Screen, icon: TrendingUp, label: 'Stats' },
  ];

  function handleSelectCustomer(c: FieldCustomer) {
    setSelectedCustomer(c);
    setScreen('customer-detail');
  }

  function handleBack() {
    setScreen('customers');
    setSelectedCustomer(null);
  }

  const activeTab = screen === 'customer-detail' ? 'customers' : screen === 'credit-collection' ? 'call-plan' : screen === 'leaderboard' ? 'my-stats' : screen;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      {/* Top nav for customer detail */}
      {screen === 'customer-detail' && selectedCustomer && (
        <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3">
          <button onClick={handleBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white truncate">{selectedCustomer.name}</span>
        </div>
      )}

      {/* Page title for other screens */}
      {screen !== 'customer-detail' && screen !== 'home' && (
        <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-4 flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-900 dark:text-white">
            {screen === 'customers' ? 'Customers' : screen === 'order-history' ? 'My Orders' : screen === 'call-plan' ? 'Call Plan' : screen === 'credit-collection' ? 'Credit Collection' : screen === 'leaderboard' ? 'Leaderboard' : 'My Stats'}
          </h1>
          {screen === 'my-stats' && (
            <button onClick={() => setScreen('leaderboard')} className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
              <TrendingUp className="w-3.5 h-3.5" /> Leaderboard
            </button>
          )}
          {screen === 'call-plan' && (
            <button onClick={() => setScreen('credit-collection')} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 hover:underline">
              <AlertTriangle className="w-3.5 h-3.5" /> Credit
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div>
        {screen === 'home' && <HomeScreen user={{ id: user.id, name: user.name }} businessId={businessId} onNavigate={setScreen} />}
        {screen === 'customers' && <CustomersScreen agentId={user.id} businessId={businessId} onSelectCustomer={handleSelectCustomer} />}
        {screen === 'customer-detail' && selectedCustomer && (
          <CustomerDetailScreen customer={selectedCustomer} agentId={user.id} businessId={businessId} />
        )}
        {screen === 'order-history' && <OrderHistoryScreen agentId={user.id} businessId={businessId} />}
        {screen === 'call-plan' && <CallPlanScreen agentId={user.id} businessId={businessId} />}
        {screen === 'credit-collection' && <CreditCollectionScreen agentId={user.id} businessId={businessId} />}
        {screen === 'leaderboard' && <LeaderboardScreen agentId={user.id} businessId={businessId} />}
        {screen === 'my-stats' && <MyStatsScreen agentId={user.id} businessId={businessId} />}
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex">
        {TAB_ITEMS.map(tab => (
          <button
            key={tab.screen}
            onClick={() => { setScreen(tab.screen); setSelectedCustomer(null); }}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 min-h-[56px] transition-colors ${activeTab === tab.screen ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <tab.icon className={`w-5 h-5 ${activeTab === tab.screen ? 'stroke-2' : ''}`} />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
