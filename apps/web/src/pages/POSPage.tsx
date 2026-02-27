import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, PauseCircle,
  PlayCircle, X, ChevronDown, User, MessageSquare, Star,
} from 'lucide-react';
import { api } from '../lib/api';
import { usePOSStore, type ApiItem, type PriceLevel } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import PaymentModal from '../components/PaymentModal';
import HeldSalesModal from '../components/HeldSalesModal';
import CustomerSelectModal from '../components/CustomerSelectModal';
import PrintModal from '../components/PrintModal';
import type { ReceiptData } from '../lib/printer';

// ─── Types ────────────────────────────────────────────────────

interface SalePayload {
  storeId: string;
  businessId: string;
  cashierId: string;
  type: 'NORMAL';
  priceLevel: PriceLevel;
  customerId?: string;
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
  discountCents?: number;
  promotionId?: string;
}

interface Promotion {
  id: string;
  name: string;
  type: string;
  discountType: string;
  discountValue: number;
  minPurchaseCents?: number;
  maxDiscountCents?: number;
  applicableItems: string; // JSON array of item IDs
}

interface SaleResult {
  id: string;
  receiptNumber: string;
  totalCents: number;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  VIP: 'VIP',
};

// ─── Component ───────────────────────────────────────────────

export default function POSPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const {
    cart, addToCart, removeFromCart, updateQuantity, updateDiscount, clearCart,
    priceLevel, setPriceLevel,
    customerId, customerName, setCustomer,
    heldSales, holdCurrentSale, resumeHeldSale, discardHeldSale,
  } = usePOSStore();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showPayment, setShowPayment] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<SaleResult | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [loyaltyDiscountApplied, setLoyaltyDiscountApplied] = useState(false);
  const [loyaltyDiscountCents, setLoyaltyDiscountCents] = useState(0);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  // ─── Data ───────────────────────────────────────────────

  const { data: items = [] } = useQuery<ApiItem[]>({
    queryKey: ['items', businessId, storeId, search],
    queryFn: () =>
      api.get<ApiItem[]>(
        `/items?businessId=${businessId}&storeId=${storeId}${
          search ? `&search=${encodeURIComponent(search)}` : ''
        }`,
      ),
    enabled: !!businessId && !!storeId,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', businessId],
    queryFn: () => api.get<Category[]>(`/items/categories?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: activePromotions = [] } = useQuery<Promotion[]>({
    queryKey: ['active-promotions', businessId],
    queryFn: () => api.get<Promotion[]>(`/promotions/active?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  // Loyalty points for selected customer
  const { data: loyaltyData } = useQuery<{ loyaltyPoints: number; program?: { redemptionRate: number; minRedemption: number } } | null>({
    queryKey: ['loyalty-customer', customerId],
    queryFn: async () => {
      if (!customerId) return null;
      try {
        const [customer, program] = await Promise.all([
          api.get<{ id: string; phone?: string; loyaltyPoints: number }>(`/businesses/${businessId}/customers/${customerId}`),
          api.get<{ pointsPerCent: number; redemptionRate: number; minRedemption: number } | null>(`/loyalty/program?businessId=${businessId}`).catch(() => null),
        ]);
        if (customer?.phone) setCustomerPhone(customer.phone);
        return { loyaltyPoints: customer.loyaltyPoints ?? 0, program: program ?? undefined };
      } catch {
        return null;
      }
    },
    enabled: !!customerId && !!businessId,
  });

  // Reset loyalty discount when customer changes or cart is cleared
  useEffect(() => {
    setLoyaltyDiscountApplied(false);
    setLoyaltyDiscountCents(0);
    setCustomerPhone(null);
  }, [customerId]);

  // ─── Filtered items ─────────────────────────────────────

  const filteredItems =
    activeCategory === 'all'
      ? items
      : items.filter((i) => i.category?.id === activeCategory);

  // ─── Totals ────────────────────────────────────────────

  const subtotalCents = cart.reduce((s, i) => s + i.totalCents, 0);
  const serviceChargeCents = serviceChargeEnabled ? Math.round(subtotalCents * 0.10) : 0;

  // Best applicable promotion
  const cartItemIds = cart.map((i) => i.id);
  const appliedPromotion = activePromotions.find((p) => {
    if (p.minPurchaseCents && subtotalCents < p.minPurchaseCents) return false;
    const applicableItems: string[] = (() => { try { return JSON.parse(p.applicableItems) as string[]; } catch { return []; } })();
    if (applicableItems.length > 0 && !cartItemIds.some(id => applicableItems.includes(id))) return false;
    return true;
  });
  const promoDiscountCents = (() => {
    if (!appliedPromotion || subtotalCents === 0) return 0;
    let d = appliedPromotion.discountType === 'PERCENTAGE'
      ? Math.round((subtotalCents * appliedPromotion.discountValue) / 100)
      : appliedPromotion.discountValue;
    if (appliedPromotion.maxDiscountCents && d > appliedPromotion.maxDiscountCents) d = appliedPromotion.maxDiscountCents;
    return d;
  })();

  const totalDiscountCents = promoDiscountCents + (loyaltyDiscountApplied ? loyaltyDiscountCents : 0);
  const taxBase = subtotalCents - totalDiscountCents;
  const vatCents = Math.round(
    cart.filter((i) => i.vatApplicable).reduce((s, i) => s + i.totalCents, 0) * 0.16 * (Math.max(taxBase, 0) / Math.max(subtotalCents, 1)),
  );
  const totalCents = Math.max(0, taxBase) + serviceChargeCents + vatCents;

  // ─── Checkout ──────────────────────────────────────────

  const checkoutMutation = useMutation<SaleResult, Error, Array<{ method: string; amountCents: number; reference?: string }>>({
    mutationFn: (payments) => {
      const payload: SalePayload = {
        storeId,
        businessId,
        cashierId: user?.id ?? '',
        type: 'NORMAL',
        priceLevel,
        customerId: customerId ?? undefined,
        items: cart.map((i) => ({ itemId: i.id, quantity: i.quantity })),
        payments,
        ...(totalDiscountCents > 0 && {
          discountCents: totalDiscountCents,
          promotionId: appliedPromotion?.id,
        }),
      };
      return api.post<SaleResult>('/sales/checkout', payload);
    },
    onSuccess: (result) => {
      setLastReceipt(result);

      // Redeem gift card if used as payment
      const gcPayment = (checkoutMutation.variables ?? []).find((p) => p.method === 'GIFT_CARD');
      if (gcPayment?.reference) {
        void api.post(`/gift-cards/${gcPayment.reference}/redeem`, {
          amountCents: gcPayment.amountCents,
          saleId: result.id,
        });
      }

      // Earn loyalty points if customer linked
      if (customerId) {
        void api.post('/loyalty/earn', {
          customerId,
          saleCents: subtotalCents,
          saleId: result.id,
        }).then(() => {
          void qc.invalidateQueries({ queryKey: ['loyalty-customer', customerId] });
        }).catch(() => {/* non-critical */});
      }

      // Prepare receipt data for printing (eTIMS not yet submitted)
      const receipt: ReceiptData = {
        receiptNumber: result.receiptNumber,
        businessName: 'Universal POS',
        storeName: 'Main Store',
        date: new Date().toISOString(),
        cashierName: user?.name ?? 'Cashier',
        customerName: customerName ?? undefined,
        customerPhone: customerPhone ?? undefined,
        items: cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
          discountPercent: item.discountPercent,
        })),
        subtotalCents,
        serviceChargeCents,
        vatCents,
        totalCents,
        payments: checkoutMutation.variables ?? [],
        etimsSubmitted: false,
        saleId: result.id,
      };
      setReceiptData(receipt);

      // Best-effort eTIMS submission in background
      void api.post(`/etims/submit/${result.id}`).then(() => {
        setReceiptData((prev) => prev ? { ...prev, etimsSubmitted: true } : prev);
      }).catch(() => {/* will show watermark if fails */});

      clearCart();
      setLoyaltyDiscountApplied(false);
      setLoyaltyDiscountCents(0);
      setShowPayment(false);
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // ─── Barcode / quick-entry handler ──────────────────────

  const handleBarcodeSearch = useCallback((raw: string) => {
    // Quick keyboard entry: "3×500" or "3x500" => find item at KES 500 and add 3 times
    const qkMatch = raw.match(/^(\d+)[x×*](\d+)$/i);
    if (qkMatch) {
      const qty = parseInt(qkMatch[1]);
      const priceCents = parseInt(qkMatch[2]) * 100;
      const hit = items.find(i => i.retailPriceCents === priceCents);
      if (hit) {
        for (let k = 0; k < qty; k++) addToCart(hit);
        setSearch('');
        return;
      }
    }
    // Barcode scan fallback
    const item = items.find(i => i.barcode === raw);
    if (item) {
      addToCart(item);
      setSearch('');
    }
  }, [items, addToCart]);

  // ─── Keyboard shortcuts ─────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'F1') {
        e.preventDefault();
        if (cart.length > 0) setShowPayment(true);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setShowCustomerModal(true);
      } else if (e.key === 'F3') {
        e.preventDefault();
        setServiceChargeEnabled(!serviceChargeEnabled);
      } else if (e.key === 'F5') {
        e.preventDefault();
        holdCurrentSale();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setShowHeld(true);
      } else if (e.key === 'Escape') {
        setShowPayment(false);
        setShowHeld(false);
        setShowCustomerModal(false);
        setLastReceipt(null);
      }
    },
    [cart.length, holdCurrentSale, serviceChargeEnabled],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Item Grid ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search + Price Level bar */}
        <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search) {
                  handleBarcodeSearch(search);
                }
              }}
              placeholder='Search, scan barcode, or 3×500 ( / )'
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <select
              value={priceLevel}
              onChange={(e) => setPriceLevel(e.target.value as PriceLevel)}
              className="appearance-none pl-3 pr-8 py-2 border rounded-lg text-sm font-medium bg-white cursor-pointer focus:ring-2 focus:ring-blue-500"
            >
              {(Object.keys(PRICE_LEVEL_LABELS) as PriceLevel[]).map((val) => (
                <option key={val} value={val}>{PRICE_LEVEL_LABELS[val]} Price</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          {customerName ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
                <User className="w-4 h-4 text-blue-600" />
                <span className="text-blue-700 font-medium">{customerName}</span>
                <button onClick={() => setCustomer(null, null)} className="text-blue-400 hover:text-blue-700">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {loyaltyData && loyaltyData.loyaltyPoints > 0 && loyaltyData.program && (
                <button
                  onClick={async () => {
                    if (loyaltyDiscountApplied) {
                      setLoyaltyDiscountApplied(false);
                      setLoyaltyDiscountCents(0);
                    } else {
                      try {
                        const result = await api.post<{ discountCents: number }>('/loyalty/redeem', {
                          customerId,
                          points: loyaltyData.loyaltyPoints,
                          saleId: 'preview',
                        });
                        setLoyaltyDiscountCents(result.discountCents);
                        setLoyaltyDiscountApplied(true);
                      } catch { /* insufficient points or no program */ }
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                    loyaltyDiscountApplied
                      ? 'bg-yellow-500 text-white'
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-300 hover:bg-yellow-100'
                  }`}
                  title={`${loyaltyData.loyaltyPoints} pts = KES ${((loyaltyData.loyaltyPoints * (loyaltyData.program?.redemptionRate ?? 0)) / 100).toFixed(0)}`}
                >
                  <Star className="w-3.5 h-3.5" />
                  {loyaltyDiscountApplied ? `−KES ${(loyaltyDiscountCents / 100).toFixed(0)}` : `${loyaltyData.loyaltyPoints} pts`}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowCustomerModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              title="Select customer (F2)"
            >
              <User className="w-4 h-4" />
              Customer
            </button>
          )}
        </div>

        {/* Category tabs */}
        <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Items
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Item grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const price =
                priceLevel === 'WHOLESALE' && item.wholesalePriceCents
                  ? item.wholesalePriceCents
                  : priceLevel === 'VIP' && item.vipPriceCents
                    ? item.vipPriceCents
                    : item.retailPriceCents;
              const outOfStock = item.trackStock && (item.currentStock ?? 0) <= 0;
              const isExpiringSoon = !!(item.trackExpiry && item.defaultExpiryDays != null && item.defaultExpiryDays <= 30);
              const isExpired = !!(item.trackExpiry && item.defaultExpiryDays != null && item.defaultExpiryDays <= 0);
              return (
                <button
                  key={item.id}
                  onClick={() => { if (!outOfStock && !isExpired) addToCart(item); }}
                  disabled={outOfStock || isExpired}
                  className={`p-3 rounded-xl border-2 text-left transition-all relative ${
                    outOfStock || isExpired
                      ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                      : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-md active:scale-95'
                  }`}
                >
                  {isExpiringSoon && !isExpired && (
                    <div className="absolute top-1 right-1 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">
                      Expiring
                    </div>
                  )}
                  {isExpired && (
                    <div className="absolute top-1 right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
                      Expired
                    </div>
                  )}
                  <div
                    className="w-full h-12 rounded-lg mb-2 flex items-center justify-center text-xl font-bold text-white"
                    style={{ backgroundColor: item.category?.color ?? '#3B82F6' }}
                  >
                    {item.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{item.name}</p>
                  <p className="text-sm font-bold text-blue-600 mt-1">{formatKES(price)}</p>
                  {item.trackStock && (
                    <p className={`text-xs mt-0.5 ${outOfStock ? 'text-red-500' : 'text-gray-400'}`}>
                      {outOfStock ? 'Out of stock' : `${item.currentStock ?? 0} in stock`}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          {filteredItems.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No items found</p>
            </div>
          )}
        </div>

        {/* Keyboard hints */}
        <div className="bg-gray-50 border-t px-4 py-1.5 flex gap-3 text-xs text-gray-400 overflow-x-auto">
          <span><kbd className="bg-gray-200 px-1 rounded">/</kbd> Search</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F1</kbd> Pay</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F2</kbd> Customer</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F3</kbd> Service</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F5</kbd> Hold</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F6</kbd> Held ({heldSales.length})</span>
        </div>
      </div>

      {/* ── Right: Cart ── */}
      <div className="w-96 bg-white border-l flex flex-col">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            <h2 className="font-bold text-gray-800">Cart ({cart.length})</h2>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => holdCurrentSale()}
              disabled={cart.length === 0}
              title="Hold sale (F5)"
              className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg disabled:opacity-30"
            >
              <PauseCircle className="w-5 h-5" />
            </button>
            {heldSales.length > 0 && (
              <button
                onClick={() => setShowHeld(true)}
                title="Held sales (F6)"
                className="relative p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
              >
                <PlayCircle className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {heldSales.length}
                </span>
              </button>
            )}
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              title="Clear cart"
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1">Tap items to add</p>
            </div>
          ) : (
            <div className="divide-y">
              {cart.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatKES(item.unitPriceCents)} each
                        {item.discountPercent && item.discountPercent > 0 && (
                          <span className="ml-1 text-green-600">(-{item.discountPercent}%)</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-bold text-gray-800">{formatKES(item.totalCents)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={item.discountPercent ?? 0}
                      onChange={(e) => updateDiscount(item.id, parseFloat(e.target.value) || 0)}
                      placeholder="Disc %"
                      className="w-20 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">% off</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t">
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatKES(subtotalCents)}</span>
            </div>
            {promoDiscountCents > 0 && (
              <div className="flex justify-between text-green-600 font-medium">
                <span className="flex items-center gap-1">
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">PROMO</span>
                  {appliedPromotion?.name}
                </span>
                <span>-{formatKES(promoDiscountCents)}</span>
              </div>
            )}
            {serviceChargeCents > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Service (10%)</span>
                <span>{formatKES(serviceChargeCents)}</span>
              </div>
            )}
            {vatCents > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>VAT (16%)</span>
                <span>{formatKES(vatCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Total</span>
              <span className="text-blue-600">{formatKES(totalCents)}</span>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  serviceChargeEnabled
                    ? 'bg-green-50 border-green-500 text-green-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title="Toggle service charge (F3)"
              >
                Service {serviceChargeEnabled ? '✓' : ''}
              </button>
            </div>
            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.length === 0 || checkoutMutation.isPending}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
            >
              {checkoutMutation.isPending
                ? 'Processing…'
                : cart.length > 0
                  ? `Pay ${formatKES(totalCents)}  (F1)`
                  : 'Pay  (F1)'}
            </button>
            {checkoutMutation.error && (
              <p className="mt-2 text-xs text-red-600 text-center">{checkoutMutation.error.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showPayment && (
        <PaymentModal
          totalCents={totalCents}
          onComplete={(payments) => checkoutMutation.mutate(payments)}
          onCancel={() => setShowPayment(false)}
          isProcessing={checkoutMutation.isPending}
          error={checkoutMutation.error?.message}
        />
      )}

      {showHeld && (
        <HeldSalesModal
          heldSales={heldSales}
          onResume={(id) => { resumeHeldSale(id); setShowHeld(false); }}
          onDiscard={discardHeldSale}
          onClose={() => setShowHeld(false)}
        />
      )}

      {showCustomerModal && (
        <CustomerSelectModal
          businessId={businessId}
          onSelect={(id, name) => setCustomer(id, name)}
          onClose={() => setShowCustomerModal(false)}
        />
      )}

      {lastReceipt && receiptData && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-4 rounded-xl shadow-xl z-50 max-w-xs">
          <div className="font-bold mb-1">Sale Complete!</div>
          <div className="text-sm opacity-90">Receipt #{lastReceipt.receiptNumber}</div>
          <div className="text-sm opacity-90">{formatKES(lastReceipt.totalCents)}</div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex-1 py-1.5 bg-white text-green-600 rounded-lg text-sm font-medium hover:bg-green-50"
            >
              Print
            </button>
            {customerPhone && (
              <button
                onClick={async () => {
                  setSendingWhatsApp(true);
                  try {
                    await api.post('/notifications/send-receipt', {
                      businessId,
                      phone: customerPhone,
                      receiptNumber: lastReceipt.receiptNumber,
                      totalCents: lastReceipt.totalCents,
                      channel: 'whatsapp',
                    });
                  } finally {
                    setSendingWhatsApp(false);
                  }
                }}
                disabled={sendingWhatsApp}
                className="px-3 py-1.5 bg-teal-500 rounded-lg hover:bg-teal-400 disabled:opacity-50"
                title="Send WhatsApp receipt"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => { setLastReceipt(null); setReceiptData(null); }}
              className="px-3 py-1.5 bg-green-700 rounded-lg hover:bg-green-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showPrintModal && receiptData && (
        <PrintModal
          receipt={receiptData}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
}
