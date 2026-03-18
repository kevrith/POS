import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, Search, Loader2, CheckCircle2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnlineMenuItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: string;
  imageUrl?: string;
  allergens?: string[];
  soldOut?: boolean;
  vatApplicable: boolean;
}

interface CartEntry {
  item: OnlineMenuItem;
  qty: number;
}

interface BusinessSettings {
  name?: string;
  storeId?: string;
}

type DeliveryType = 'PICKUP' | 'TABLE';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

const CAT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
function catColor(cat: string): string {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = cat.charCodeAt(i) + ((h << 5) - h);
  return CAT_COLORS[Math.abs(h) % CAT_COLORS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnlineOrderPage() {
  const { businessId } = useParams<{ businessId: string }>();

  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [items, setItems] = useState<OnlineMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('PICKUP');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!businessId) return;
    Promise.all([
      fetch(`/api/v1/business/${businessId}/settings`).then(r => r.json()),
      fetch(`/api/v1/items?businessId=${businessId}&activeOnly=true`).then(r => r.json()),
    ])
      .then(([s, i]) => {
        setSettings(s as BusinessSettings);
        setItems(i as OnlineMenuItem[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [businessId]);

  // ─── Cart helpers ──────────────────────────────────────────────────────────

  function addToCart(item: OnlineMenuItem) {
    setCart(prev => {
      const existing = prev.find(e => e.item.id === item.id);
      if (existing) return prev.map(e => e.item.id === item.id ? { ...e, qty: e.qty + 1 } : e);
      return [...prev, { item, qty: 1 }];
    });
  }

  function removeFromCart(itemId: string) {
    setCart(prev => {
      const existing = prev.find(e => e.item.id === itemId);
      if (!existing) return prev;
      if (existing.qty <= 1) return prev.filter(e => e.item.id !== itemId);
      return prev.map(e => e.item.id === itemId ? { ...e, qty: e.qty - 1 } : e);
    });
  }

  function deleteFromCart(itemId: string) {
    setCart(prev => prev.filter(e => e.item.id !== itemId));
  }

  function cartQty(itemId: string): number {
    return cart.find(e => e.item.id === itemId)?.qty ?? 0;
  }

  const totalCents = cart.reduce((sum, e) => sum + e.item.retailPriceCents * e.qty, 0);
  const totalItems = cart.reduce((sum, e) => sum + e.qty, 0);

  // ─── Categories ───────────────────────────────────────────────────────────

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category ?? '').filter(Boolean)))];

  const filteredItems = items.filter(item => {
    if (activeCategory !== 'all' && (item.category ?? '') !== activeCategory) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // ─── Order submission ─────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim()) {
      setSubmitError('Name and phone are required');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const tableNotes = [
        `Customer: ${customerName.trim()}`,
        `Phone: ${phone.trim()}`,
        deliveryType === 'TABLE' && tableNumber ? `Table: ${tableNumber}` : 'Pickup',
        notes ? `Notes: ${notes}` : '',
      ].filter(Boolean).join(', ');

      const body = {
        businessId,
        storeId: (settings as { id?: string; storeId?: string })?.storeId ?? '',
        mode: 'COUNTER',
        coverCount: 1,
        tableNotes,
        items: cart.map(e => ({
          itemId: e.item.id,
          name: e.item.name,
          quantity: e.qty,
          unitPriceCents: e.item.retailPriceCents,
          totalCents: e.item.retailPriceCents * e.qty,
        })),
      };

      const res = await fetch('/api/v1/hospitality/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to place order');
      const data = await res.json() as { id?: string; orderNumber?: string };
      setConfirmedOrder(data.orderNumber ?? data.id ?? 'N/A');
      setCart([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Confirmation screen ──────────────────────────────────────────────────

  if (confirmedOrder) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-gray-900 mb-2">Order Placed!</h1>
          <p className="text-gray-500 mb-4">Your order has been received</p>
          <div className="bg-emerald-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-emerald-600 font-medium">Order #</p>
            <p className="text-3xl font-black text-emerald-700">{confirmedOrder}</p>
          </div>
          <p className="text-sm text-gray-400 mb-6">We'll prepare your order shortly. You'll be notified when it's ready.</p>
          <button
            onClick={() => { setConfirmedOrder(null); setShowCheckout(false); setCustomerName(''); setPhone(''); setNotes(''); setTableNumber(''); }}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700"
          >
            Place Another Order
          </button>
        </div>
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // ─── Checkout form overlay ────────────────────────────────────────────────

  if (showCheckout) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-4 flex items-center gap-3">
          <button onClick={() => setShowCheckout(false)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
          <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Order summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-700 mb-3 text-sm">Order Summary</h2>
            <div className="space-y-2">
              {cart.map(e => (
                <div key={e.item.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">{e.qty}× {e.item.name}</span>
                  <span className="font-medium text-gray-900">{fmt(e.item.retailPriceCents * e.qty)}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>{fmt(totalCents)}</span>
              </div>
            </div>
          </div>

          {/* Checkout form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <h2 className="font-semibold text-gray-700 text-sm">Your Details</h2>

            {submitError && (
              <div className="px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm">{submitError}</div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Your full name"
                required
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="07XX XXX XXX"
                required
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Order Type</label>
              <div className="flex gap-3">
                {(['PICKUP', 'TABLE'] as DeliveryType[]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDeliveryType(type)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      deliveryType === type
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'
                    }`}
                  >
                    {type === 'PICKUP' ? 'Pickup / Counter' : 'Table Service'}
                  </button>
                ))}
              </div>
            </div>

            {deliveryType === 'TABLE' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Table Number</label>
                <input
                  type="text"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  placeholder="e.g. Table 5"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Allergies, special requests…"
                className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Placing Order…' : `Place Order · ${fmt(totalCents)}`}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Cart slide-over ──────────────────────────────────────────────────────

  const CartOverlay = () => (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={() => setShowCart(false)} />
      <div className="bg-white w-full max-w-sm flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <h2 className="font-bold text-gray-900">Your Cart ({totalItems})</h2>
          <button onClick={() => setShowCart(false)} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {cart.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Cart is empty</p>
            </div>
          )}
          {cart.map(e => (
            <div key={e.item.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{e.item.name}</p>
                <p className="text-xs text-gray-500">{fmt(e.item.retailPriceCents)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => removeFromCart(e.item.id)} className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full">
                  <Minus className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <span className="text-sm font-bold w-5 text-center">{e.qty}</span>
                <button onClick={() => addToCart(e.item)} className="w-7 h-7 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full">
                  <Plus className="w-3.5 h-3.5 text-gray-600" />
                </button>
                <button onClick={() => deleteFromCart(e.item.id)} className="text-red-400 hover:text-red-600 ml-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {cart.length > 0 && (
          <div className="px-4 py-4 border-t border-gray-200">
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-3">
              <span>Total</span>
              <span className="text-base font-bold text-gray-900">{fmt(totalCents)}</span>
            </div>
            <button
              onClick={() => { setShowCart(false); setShowCheckout(true); }}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700"
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // ─── Main menu view ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{settings?.name ?? 'Online Order'}</h1>
              <p className="text-xs text-gray-400 mt-0.5">Order online · Fast &amp; easy</p>
            </div>
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700"
            >
              <ShoppingCart className="w-4 h-4" />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4.5 h-4.5 w-5 h-5 flex items-center justify-center font-bold">
                  {totalItems}
                </span>
              )}
              {totalCents > 0 ? fmt(totalCents) : 'Cart'}
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search menu…"
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Item grid */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filteredItems.map(item => {
            const qty = cartQty(item.id);
            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${item.soldOut ? 'opacity-50' : ''}`}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-28 object-cover" />
                ) : (
                  <div
                    className="w-full h-28 flex items-center justify-center text-2xl font-black text-white"
                    style={{ backgroundColor: catColor(item.category ?? item.name) }}
                  >
                    {item.name[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="p-3 flex flex-col flex-1">
                  <p className="text-sm font-semibold text-gray-900 line-clamp-2 flex-1">{item.name}</p>
                  {item.category && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.category}</p>
                  )}
                  <p className="text-sm font-bold text-blue-600 mt-1">{fmt(item.retailPriceCents)}</p>
                  {item.soldOut ? (
                    <div className="mt-2 py-1.5 text-center text-xs font-semibold text-red-500 bg-red-50 rounded-lg">Sold Out</div>
                  ) : qty === 0 ? (
                    <button
                      onClick={() => addToCart(item)}
                      className="mt-2 w-full py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center justify-between bg-blue-50 rounded-lg px-2 py-1">
                      <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 flex items-center justify-center bg-white border border-blue-200 rounded-full hover:bg-blue-100">
                        <Minus className="w-3 h-3 text-blue-600" />
                      </button>
                      <span className="text-sm font-bold text-blue-700">{qty}</span>
                      <button onClick={() => addToCart(item)} className="w-6 h-6 flex items-center justify-center bg-blue-600 rounded-full hover:bg-blue-700">
                        <Plus className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No items found</p>
          </div>
        )}

        <div className="text-center py-6 text-xs text-gray-300">
          Powered by KASTRA POS
        </div>
      </div>

      {/* Fixed bottom checkout bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 shadow-2xl px-4 py-3 flex gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => setShowCart(true)}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            View Cart ({totalItems})
          </button>
          <button
            onClick={() => setShowCheckout(true)}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700"
          >
            Checkout · {fmt(totalCents)}
          </button>
        </div>
      )}

      {showCart && <CartOverlay />}
    </div>
  );
}
