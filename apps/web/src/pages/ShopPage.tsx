import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ShoppingCart, Plus, Minus, Search, Loader2, CheckCircle2, X,
  Smartphone, MapPin, Package, Clock, LogOut, ReceiptText, RefreshCw,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────
interface MenuItem { id: string; name: string; retailPriceCents: number; category?: string }
interface Category { name: string; items: MenuItem[] }
interface MenuResp { business: { name?: string } | null; categories: Category[] }
interface CartEntry { item: MenuItem; qty: number }
interface Address { id: string; label?: string | null; address: string; isDefault: boolean }
interface OrderItem { name: string; quantity: number; unitPriceCents: number; totalCents: number; itemId?: string }
interface UnifiedOrder {
  id: string; orderNumber: string; channel: 'ONLINE' | 'AGENT'; status: string; paymentStatus: string;
  fulfillmentType: string; deliveryAddress?: string | null; etaMinutes?: number | null;
  totalCents: number; invoiceNumber?: string | null; createdAt: string; items: OrderItem[];
}
interface Session { token: string; customerId: string; customerName: string; phone: string; businessId: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SESSION_KEY = 'customer-portal-session';
const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

function normalizePhone(local: string): string {
  let d = local.replace(/[^0-9]/g, '');
  if (d.startsWith('254')) return d;
  if (d.startsWith('0')) d = d.slice(1);
  return `254${d}`;
}
function loadSession(): Session | null {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'); } catch { return null; }
}
function saveSession(s: Session | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
async function portalFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const s = loadSession();
  const res = await fetch(`/api/v1${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(s?.token ? { Authorization: `Bearer ${s.token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) { throw new Error((await res.text()) || `HTTP ${res.status}`); }
  if (res.status === 204) return undefined as T;
  return res.json();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700', CONFIRMED: 'bg-indigo-100 text-indigo-700',
  READY: 'bg-blue-100 text-blue-700', ASSIGNED: 'bg-purple-100 text-purple-700',
  IN_TRANSIT: 'bg-orange-100 text-orange-700', DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500', REJECTED: 'bg-red-100 text-red-700',
  SUBMITTED: 'bg-blue-100 text-blue-700', INVOICED: 'bg-purple-100 text-purple-700',
};

// ─── Page ───────────────────────────────────────────────────────────────────
export default function ShopPage() {
  const { businessId = '' } = useParams<{ businessId: string }>();
  const [session, setSession] = useState<Session | null>(() => {
    const s = loadSession();
    return s && s.businessId === businessId ? s : null;
  });
  const [bizName, setBizName] = useState('');

  if (!session) {
    return <LoginView businessId={businessId} bizName={bizName} onName={setBizName} onLogin={(s) => { saveSession(s); setSession(s); }} />;
  }
  return <Shop session={session} onLogout={() => { saveSession(null); setSession(null); }} />;
}

// ─── OTP login ──────────────────────────────────────────────────────────────
function LoginView({ businessId, bizName, onName, onLogin }: {
  businessId: string; bizName: string; onName: (n: string) => void; onLogin: (s: Session) => void;
}) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phoneInput, setPhoneInput] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const phone = normalizePhone(phoneInput);

  useEffect(() => {
    fetch(`/api/v1/portal/menu?businessId=${businessId}`)
      .then((r) => r.json()).then((m: MenuResp) => onName(m.business?.name ?? '')).catch(() => {});
  }, [businessId, onName]);

  async function requestOtp() {
    if (phoneInput.replace(/[^0-9]/g, '').length < 9) { setError('Enter a valid phone number.'); return; }
    setLoading(true); setError('');
    try {
      const r = await portalFetch<{ isNew: boolean; otp?: string }>('/portal/auth/request-otp', {
        method: 'POST', body: JSON.stringify({ phone, businessId }),
      });
      setIsNew(r.isNew); setDevOtp(r.otp ?? null); setStep('otp');
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  async function verify() {
    if (otp.trim().length < 4) { setError('Enter the code we sent you.'); return; }
    if (isNew && !name.trim()) { setError('Please tell us your name.'); return; }
    setLoading(true); setError('');
    try {
      const r = await portalFetch<{ token: string; customerId: string; customerName: string }>('/portal/auth/verify-otp', {
        method: 'POST', body: JSON.stringify({ phone, otp: otp.trim(), businessId, ...(isNew ? { name: name.trim() } : {}) }),
      });
      onLogin({ token: r.token, customerId: r.customerId, customerName: r.customerName, phone, businessId });
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 mx-auto flex items-center justify-center mb-3">
            <ShoppingCart className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{bizName || 'Order Online'}</h1>
          <p className="text-sm text-gray-500">{step === 'phone' ? 'Sign in to order & track' : 'Enter the code we texted you'}</p>
        </div>
        <div className="bg-white rounded-2xl shadow p-5 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          {step === 'phone' ? (
            <>
              <label className="text-sm font-medium text-gray-700">Phone number</label>
              <div className="flex gap-2">
                <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-700 flex items-center">+254</span>
                <input autoFocus value={phoneInput} onChange={(e) => { setPhoneInput(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && requestOtp()}
                  placeholder="7XX XXX XXX" inputMode="tel"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <button onClick={requestOtp} disabled={loading}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />} Send code
              </button>
            </>
          ) : (
            <>
              <label className="text-sm font-medium text-gray-700">Verification code</label>
              <p className="text-xs text-gray-400">Sent to +{phone}{devOtp ? ` · dev: ${devOtp}` : ''}</p>
              <input autoFocus value={otp} onChange={(e) => { setOtp(e.target.value.replace(/[^0-9]/g, '')); setError(''); }}
                maxLength={6} inputMode="numeric" placeholder="••••••"
                className="w-full border rounded-lg px-3 py-2 text-center text-2xl tracking-[0.4em] font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
              {isNew && (
                <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="Your name"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              )}
              <button onClick={verify} disabled={loading}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {isNew ? 'Create account' : 'Sign in'}
              </button>
              <button onClick={() => { setStep('phone'); setOtp(''); setError(''); }} className="w-full text-xs text-gray-500 py-1">Change number</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Authenticated shop ──────────────────────────────────────────────────────
function Shop({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [menu, setMenu] = useState<MenuResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [checkout, setCheckout] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/portal/menu?businessId=${session.businessId}`)
      .then((r) => r.json()).then((m: MenuResp) => setMenu(m)).catch(() => {}).finally(() => setLoading(false));
  }, [session.businessId]);

  const allItems = (menu?.categories ?? []).flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));
  const cats = ['all', ...(menu?.categories ?? []).map((c) => c.name)];
  const visible = allItems.filter((i) =>
    (activeCat === 'all' || i.category === activeCat) &&
    (!search.trim() || i.name.toLowerCase().includes(search.toLowerCase())));

  const add = (item: MenuItem) => setCart((p) => {
    const e = p.find((x) => x.item.id === item.id);
    return e ? p.map((x) => x.item.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...p, { item, qty: 1 }];
  });
  const dec = (id: string) => setCart((p) => p.flatMap((x) => x.item.id === id ? (x.qty <= 1 ? [] : [{ ...x, qty: x.qty - 1 }]) : [x]));
  const qtyOf = (id: string) => cart.find((x) => x.item.id === id)?.qty ?? 0;
  const cartCount = cart.reduce((s, x) => s + x.qty, 0);
  const cartTotal = cart.reduce((s, x) => s + x.item.retailPriceCents * x.qty, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">{menu?.business?.name || 'Order Online'}</h1>
            <p className="text-xs text-gray-400">Hi {session.customerName}</p>
          </div>
          <button onClick={onLogout} className="text-gray-400 hover:text-gray-700 flex items-center gap-1 text-sm"><LogOut className="w-4 h-4" /></button>
        </div>
        <div className="max-w-2xl mx-auto px-4 flex gap-2 pb-2">
          {(['menu', 'orders'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {t === 'menu' ? 'Menu' : 'My Orders'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'orders' ? (
        <OrdersView />
      ) : loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu…"
              className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
            {cats.map((c) => (
              <button key={c} onClick={() => setActiveCat(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${activeCat === c ? 'bg-indigo-600 text-white' : 'bg-white border text-gray-600'}`}>
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {visible.map((it) => {
              const q = qtyOf(it.id);
              return (
                <div key={it.id} className="bg-white rounded-xl border p-3 flex flex-col">
                  <div className="font-medium text-sm text-gray-900 line-clamp-2 min-h-[2.5rem]">{it.name}</div>
                  <div className="text-indigo-600 font-bold text-sm mt-1">{fmt(it.retailPriceCents)}</div>
                  {q === 0 ? (
                    <button onClick={() => add(it)} className="mt-2 bg-indigo-600 text-white rounded-lg py-1.5 text-sm font-medium flex items-center justify-center gap-1"><Plus className="w-4 h-4" />Add</button>
                  ) : (
                    <div className="mt-2 flex items-center justify-between">
                      <button onClick={() => dec(it.id)} className="w-8 h-8 rounded-lg border flex items-center justify-center"><Minus className="w-4 h-4 text-indigo-600" /></button>
                      <span className="font-bold">{q}</span>
                      <button onClick={() => add(it)} className="w-8 h-8 rounded-lg border flex items-center justify-center"><Plus className="w-4 h-4 text-indigo-600" /></button>
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && <p className="col-span-2 text-center text-gray-400 py-10">No items found.</p>}
          </div>
        </div>
      )}

      {/* Cart bar */}
      {tab === 'menu' && cartCount > 0 && (
        <button onClick={() => setShowCart(true)}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-xl bg-indigo-600 text-white rounded-2xl px-5 py-3.5 flex items-center justify-between shadow-lg z-20">
          <span className="flex items-center gap-2 font-medium"><ShoppingCart className="w-5 h-5" />{cartCount} item{cartCount > 1 ? 's' : ''}</span>
          <span className="font-bold">{fmt(cartTotal)}</span>
        </button>
      )}

      {showCart && (
        <CartDrawer cart={cart} onClose={() => setShowCart(false)} add={add} dec={dec} total={cartTotal}
          onCheckout={() => { setShowCart(false); setCheckout(true); }} />
      )}
      {checkout && (
        <CheckoutModal session={session} cart={cart} total={cartTotal}
          onClose={() => setCheckout(false)} onDone={() => { setCart([]); setCheckout(false); setTab('orders'); }} />
      )}
    </div>
  );
}

// ─── Cart drawer ─────────────────────────────────────────────────────────────
function CartDrawer({ cart, onClose, add, dec, total, onCheckout }: {
  cart: CartEntry[]; onClose: () => void; add: (i: MenuItem) => void; dec: (id: string) => void; total: number; onCheckout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-xl rounded-t-2xl p-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg">Your order</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y">
          {cart.map((e) => (
            <div key={e.item.id} className="py-3 flex items-center justify-between gap-2">
              <div className="flex-1"><div className="text-sm font-medium">{e.item.name}</div><div className="text-xs text-gray-500">{fmt(e.item.retailPriceCents)}</div></div>
              <div className="flex items-center gap-2">
                <button onClick={() => dec(e.item.id)} className="w-7 h-7 rounded border flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                <span className="w-5 text-center text-sm font-bold">{e.qty}</span>
                <button onClick={() => add(e.item)} className="w-7 h-7 rounded border flex items-center justify-center"><Plus className="w-3 h-3" /></button>
              </div>
              <div className="w-20 text-right text-sm font-semibold">{fmt(e.item.retailPriceCents * e.qty)}</div>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t mt-2">
          <div className="flex justify-between font-bold mb-3"><span>Total</span><span>{fmt(total)}</span></div>
          <button onClick={onCheckout} className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold">Checkout</button>
        </div>
      </div>
    </div>
  );
}

// ─── Checkout + payment ───────────────────────────────────────────────────────
function CheckoutModal({ session, cart, total, onClose, onDone }: {
  session: Session; cart: CartEntry[]; total: number; onClose: () => void; onDone: () => void;
}) {
  const [orderType, setOrderType] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState<Address[]>([]);
  const [saveAddr, setSaveAddr] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [pay, setPay] = useState<'idle' | 'sending' | 'waiting' | 'paid' | 'failed'>('idle');

  useEffect(() => {
    portalFetch<Address[]>('/portal/me/addresses').then((list) => {
      setSaved(list);
      const def = list.find((a) => a.isDefault) ?? list[0];
      if (def) setAddress((p) => p || def.address);
    }).catch(() => {});
  }, []);

  async function place() {
    if (orderType === 'DELIVERY' && !address.trim()) { setError('Enter a delivery address.'); return; }
    setPlacing(true); setError('');
    try {
      const r = await portalFetch<{ orderId: string; orderNumber: string }>('/portal/order', {
        method: 'POST',
        body: JSON.stringify({
          businessId: session.businessId, customerName: session.customerName, phone: session.phone,
          address: orderType === 'DELIVERY' ? address.trim() : 'PICKUP', orderType, notes: notes.trim() || undefined,
          items: cart.map((e) => ({ itemId: e.item.id, name: e.item.name, quantity: e.qty, priceCents: e.item.retailPriceCents })),
        }),
      });
      if (orderType === 'DELIVERY' && saveAddr && address.trim() && !saved.some((a) => a.address.trim() === address.trim())) {
        void portalFetch('/portal/me/addresses', { method: 'POST', body: JSON.stringify({ address: address.trim(), isDefault: saved.length === 0 }) }).catch(() => {});
      }
      setPlaced(r);
    } catch (e) { setError((e as Error).message); } finally { setPlacing(false); }
  }

  async function payMpesa() {
    if (!placed) return;
    setPay('sending');
    try {
      const init = await portalFetch<{ checkoutRequestId?: string }>('/portal/pay-order', {
        method: 'POST', body: JSON.stringify({ phone: session.phone, amountCents: total, reference: placed.orderNumber }),
      });
      const crid = init.checkoutRequestId;
      if (!crid) { setPay('failed'); return; }
      setPay('waiting');
      for (let i = 0; i < 24; i++) {
        await sleep(5000);
        const st = await portalFetch<{ status: string }>(`/portal/pay-status/${crid}`).catch(() => ({ status: 'pending' }));
        if (st.status === 'paid') {
          void portalFetch(`/portal/order/${placed.orderId}/confirm-payment`, { method: 'POST', body: JSON.stringify({ checkoutRequestId: crid }) }).catch(() => {});
          setPay('paid'); setTimeout(onDone, 1400); return;
        }
        if (st.status === 'failed') { setPay('failed'); return; }
      }
      setPay('failed');
    } catch { setPay('failed'); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {placed ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-2" />
            <h2 className="text-lg font-bold">Order {placed.orderNumber} placed!</h2>
            <p className="text-sm text-gray-500 mb-4">Pay now with M-Pesa, or pay on {orderType === 'PICKUP' ? 'pickup' : 'delivery'}.</p>
            {pay === 'paid' ? (
              <p className="text-green-600 font-semibold">Payment received — thank you!</p>
            ) : (
              <>
                <button onClick={payMpesa} disabled={pay === 'sending' || pay === 'waiting'}
                  className="w-full bg-green-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mb-2">
                  {pay === 'sending' || pay === 'waiting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                  {pay === 'waiting' ? 'Check your phone for the M-Pesa prompt…' : `Pay ${fmt(total)} with M-Pesa`}
                </button>
                {pay === 'failed' && <p className="text-sm text-red-600 mb-2">Payment didn't go through. You can try again or pay later.</p>}
                <button onClick={onDone} className="w-full text-gray-500 text-sm py-2">Pay later / track order</button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">Checkout</h2>
              <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <div className="flex gap-2 mb-3">
              {(['DELIVERY', 'PICKUP'] as const).map((t) => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${orderType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600'}`}>
                  {t === 'DELIVERY' ? 'Delivery' : 'Pickup'}
                </button>
              ))}
            </div>
            {orderType === 'DELIVERY' && (
              <>
                <label className="text-sm font-medium text-gray-700">Delivery address</label>
                {saved.length > 0 && (
                  <div className="flex flex-wrap gap-2 my-2">
                    {saved.map((a) => {
                      const active = address.trim() === a.address.trim();
                      return (
                        <button key={a.id} onClick={() => setAddress(a.address)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-300'}`}>
                          <MapPin className="w-3 h-3" />{a.label || a.address}
                        </button>
                      );
                    })}
                  </div>
                )}
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2}
                  placeholder="e.g. Westlands, Nairobi — Gate 5"
                  className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" />
                {address.trim() && !saved.some((a) => a.address.trim() === address.trim()) && (
                  <label className="flex items-center gap-2 text-sm text-gray-600 mt-2 cursor-pointer">
                    <input type="checkbox" checked={saveAddr} onChange={(e) => setSaveAddr(e.target.checked)} /> Save this address
                  </label>
                )}
              </>
            )}
            <label className="text-sm font-medium text-gray-700 block mt-3">Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:ring-2 focus:ring-indigo-500 outline-none" />
            <div className="flex justify-between font-bold my-4"><span>Total</span><span>{fmt(total)}</span></div>
            <button onClick={place} disabled={placing}
              className="w-full bg-indigo-600 text-white rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} Place order
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Orders tracking ──────────────────────────────────────────────────────────
function OrdersView() {
  const [orders, setOrders] = useState<UnifiedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    portalFetch<UnifiedOrder[]>('/portal/me/orders').then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  if (orders.length === 0) return (
    <div className="text-center py-20 text-gray-400"><Package className="w-12 h-12 mx-auto mb-2 opacity-40" /><p>No orders yet.</p></div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
      <button onClick={load} className="text-sm text-indigo-600 flex items-center gap-1 ml-auto"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      {orders.map((o) => (
        <div key={o.id} className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{o.orderNumber}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${o.channel === 'AGENT' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{o.channel === 'AGENT' ? 'Agent' : 'Online'}</span>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
          </div>
          <ul className="text-sm text-gray-600 my-2 space-y-0.5">
            {o.items.map((it, i) => <li key={i} className="flex justify-between"><span>{it.quantity}× {it.name}</span><span>{fmt(it.totalCents)}</span></li>)}
          </ul>
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-bold text-indigo-600">{fmt(o.totalCents)}</span>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${o.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.paymentStatus}</span>
              {o.etaMinutes ? <span className="text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />ETA {o.etaMinutes}m</span> : null}
              {o.invoiceNumber ? <span className="text-gray-500 flex items-center gap-1"><ReceiptText className="w-3 h-3" />{o.invoiceNumber}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
