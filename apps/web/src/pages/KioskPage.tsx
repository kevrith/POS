import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, CreditCard, Banknote, X, Phone, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KioskItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: string;
  imageUrl?: string;
  vatApplicable: boolean;
  barcode?: string;
}

interface CartEntry {
  item: KioskItem;
  qty: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function getParams() {
  const p = new URLSearchParams(window.location.search);
  return { businessId: p.get('businessId') ?? '', storeId: p.get('storeId') ?? '' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KioskPage() {
  const { businessId, storeId } = getParams();
  const [items, setItems] = useState<KioskItem[]>([]);
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [screen, setScreen] = useState<'shop' | 'cash-confirm' | 'mpesa' | 'success' | 'call-staff'>('shop');
  const [mpesaQR, setMpesaQR] = useState<string | null>(null);
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('Self Checkout');

  // Fetch items on mount
  useEffect(() => {
    if (!businessId) return;
    api.get<KioskItem[]>(`/items?businessId=${businessId}&activeOnly=true${storeId ? `&storeId=${storeId}` : ''}`)
      .then(setItems)
      .catch(() => setError('Could not load items. Please call staff.'));
    // Try to get business name
    api.get<{ name: string }>(`/business/${businessId}/settings`)
      .then(b => b.name && setBusinessName(b.name))
      .catch(() => {});
  }, [businessId, storeId]);

  // Cart helpers
  const addItem = useCallback((item: KioskItem) => {
    setCart(c => {
      const idx = c.findIndex(e => e.item.id === item.id);
      if (idx >= 0) return c.map((e, i) => i === idx ? { ...e, qty: e.qty + 1 } : e);
      return [...c, { item, qty: 1 }];
    });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setCart(c => c.filter(e => e.item.id !== itemId));
  }, []);

  const updateQty = useCallback((itemId: string, qty: number) => {
    if (qty <= 0) { removeItem(itemId); return; }
    setCart(c => c.map(e => e.item.id === itemId ? { ...e, qty } : e));
  }, [removeItem]);

  // Totals
  const subtotalCents = cart.reduce((s, e) => s + e.item.retailPriceCents * e.qty, 0);
  const vatCents = cart.reduce((s, e) => e.item.vatApplicable ? s + Math.round(e.item.retailPriceCents * e.qty * 16 / 116) : s, 0);
  const totalCents = subtotalCents;

  // Categories
  const categories = ['all', ...Array.from(new Set(items.map(i => i.category ?? 'Other')))];
  const filtered = activeCategory === 'all' ? items : items.filter(i => (i.category ?? 'Other') === activeCategory);

  // M-Pesa QR payment
  async function handleMpesa() {
    setMpesaLoading(true);
    try {
      const res = await api.post<{ qrCode?: string; QRCode?: string }>('/payments/mpesa/qr', {
        businessId,
        storeId,
        amountCents: totalCents,
      });
      setMpesaQR(res.qrCode ?? res.QRCode ?? null);
      setScreen('mpesa');
    } catch {
      setError('M-Pesa QR unavailable. Please pay at counter.');
    } finally {
      setMpesaLoading(false);
    }
  }

  // Cash confirm
  function handleCashPay() {
    setScreen('cash-confirm');
  }

  // Print receipt + reset
  function completeSale() {
    setScreen('success');
    setTimeout(() => {
      setCart([]);
      setScreen('shop');
      setMpesaQR(null);
    }, 5000);
  }

  // ── Overlays ────────────────────────────────────────────────────────────────

  if (screen === 'cash-confirm') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl">
          <Banknote className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">Please Pay</h2>
          <p className="text-5xl font-bold text-green-600 my-6">{fmt(totalCents)}</p>
          <p className="text-gray-500 mb-8 text-lg">Please give the exact amount to the cashier at the counter.</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => setScreen('shop')} className="px-8 py-4 rounded-xl bg-gray-100 text-gray-700 text-xl font-semibold hover:bg-gray-200">Back</button>
            <button onClick={completeSale} className="px-8 py-4 rounded-xl bg-green-600 text-white text-xl font-semibold hover:bg-green-700">Paid ✓</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'mpesa') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl">
          <Phone className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold mb-2">Pay with M-Pesa</h2>
          <p className="text-4xl font-bold text-green-600 my-4">{fmt(totalCents)}</p>
          {mpesaQR ? (
            <img src={mpesaQR} alt="M-Pesa QR" className="mx-auto w-48 h-48 my-4 border-4 border-green-200 rounded-xl" />
          ) : (
            <div className="w-48 h-48 mx-auto my-4 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">QR not available</div>
          )}
          <p className="text-gray-500 mb-6">Scan with M-Pesa app or enter till number manually.</p>
          <div className="flex gap-4 justify-center">
            <button onClick={() => setScreen('shop')} className="px-8 py-4 rounded-xl bg-gray-100 text-gray-700 text-xl font-semibold hover:bg-gray-200">Back</button>
            <button onClick={completeSale} className="px-8 py-4 rounded-xl bg-green-600 text-white text-xl font-semibold hover:bg-green-700">Payment Done ✓</button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'success') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl">
          <CheckCircle2 className="w-24 h-24 text-green-500 mx-auto mb-4" />
          <h2 className="text-4xl font-bold text-green-600 mb-2">Thank You!</h2>
          <p className="text-gray-500 text-xl">Your purchase is complete. Please take your items.</p>
          <p className="text-gray-400 mt-4">Returning to home in 5 seconds...</p>
        </div>
      </div>
    );
  }

  if (screen === 'call-staff') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl border-4 border-red-300">
          <AlertCircle className="w-24 h-24 text-red-500 mx-auto mb-4 animate-pulse" />
          <h2 className="text-4xl font-bold text-red-600 mb-2">Staff Called</h2>
          <p className="text-gray-500 text-xl mb-8">A staff member will be with you shortly.</p>
          <button onClick={() => setScreen('shop')} className="px-10 py-4 rounded-xl bg-gray-800 text-white text-xl font-semibold hover:bg-gray-700">Cancel</button>
        </div>
      </div>
    );
  }

  // ── Main shop screen ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{businessName}</h1>
          <p className="text-gray-400 text-sm">Self Checkout</p>
        </div>
        <button
          onClick={() => setScreen('call-staff')}
          className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl text-lg font-semibold flex items-center gap-2"
        >
          <Phone className="w-5 h-5" /> Call Staff
        </button>
      </div>

      {/* Category tabs */}
      <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-5 py-2 rounded-full text-base font-semibold whitespace-nowrap transition-colors ${
              activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'All Items' : cat}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-red-700 text-center text-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(item => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="bg-white rounded-xl shadow hover:shadow-md transition-shadow p-4 flex flex-col items-center gap-3 text-left active:scale-95"
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-24 h-24 object-cover rounded-lg" />
                ) : (
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="w-10 h-10 text-gray-300" />
                  </div>
                )}
                <div className="text-center">
                  <p className="font-semibold text-gray-900 text-lg leading-tight">{item.name}</p>
                  <p className="text-blue-600 font-bold text-xl mt-1">{fmt(item.retailPriceCents)}</p>
                  {item.vatApplicable && <p className="text-xs text-gray-400">VAT incl.</p>}
                </div>
                <div className="w-full bg-blue-600 text-white text-center py-2 rounded-lg font-semibold text-base">
                  + Add
                </div>
              </button>
            ))}
          </div>
          {filtered.length === 0 && !error && (
            <div className="text-center py-20 text-gray-400 text-2xl">No items available</div>
          )}
        </div>

        {/* Cart sidebar */}
        <div className="w-80 bg-white border-l flex flex-col">
          <div className="p-4 border-b bg-gray-50">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Your Order
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 && (
              <p className="text-center text-gray-400 mt-12 text-lg">Tap items to add them</p>
            )}
            {cart.map(({ item, qty }) => (
              <div key={item.id} className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                  <p className="text-blue-600 font-bold">{fmt(item.retailPriceCents * qty)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.id, qty - 1)} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-6 text-center font-bold">{qty}</span>
                  <button onClick={() => updateQty(item.id, qty + 1)} className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200">
                    <Plus className="w-4 h-4 text-blue-600" />
                  </button>
                  <button onClick={() => removeItem(item.id)} className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center hover:bg-red-200 ml-1">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals + pay */}
          <div className="border-t p-4 space-y-3">
            <div className="space-y-1 text-sm text-gray-600">
              <div className="flex justify-between"><span>Subtotal (ex-VAT)</span><span>{fmt(subtotalCents - vatCents)}</span></div>
              <div className="flex justify-between"><span>VAT (16%)</span><span>{fmt(vatCents)}</span></div>
              <div className="flex justify-between font-bold text-lg text-gray-900 pt-1 border-t"><span>Total</span><span>{fmt(totalCents)}</span></div>
            </div>

            {cart.length > 0 ? (
              <div className="space-y-2">
                <button
                  onClick={handleCashPay}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2"
                >
                  <Banknote className="w-6 h-6" /> Pay with Cash
                </button>
                <button
                  onClick={handleMpesa}
                  disabled={mpesaLoading}
                  className="w-full bg-gray-800 hover:bg-gray-900 text-white py-4 rounded-xl text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="w-6 h-6" /> {mpesaLoading ? 'Loading...' : 'Pay with M-Pesa'}
                </button>
                <button onClick={() => setCart([])} className="w-full text-red-500 hover:text-red-700 py-2 text-sm flex items-center justify-center gap-1">
                  <X className="w-4 h-4" /> Clear cart
                </button>
              </div>
            ) : (
              <div className="text-center text-gray-400 text-sm py-2">Add items to pay</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
