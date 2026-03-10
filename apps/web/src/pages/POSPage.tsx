import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, PauseCircle,
  PlayCircle, X, User, MessageSquare, Star, Scale, Camera,
  AlertTriangle, Monitor,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { api } from '../lib/api';
import { usePOSStore, type ApiItem, type PriceLevel } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import PaymentModal from '../components/PaymentModal';
import HeldSalesModal from '../components/HeldSalesModal';
import CustomerSelectModal from '../components/CustomerSelectModal';
import PrintModal from '../components/PrintModal';
import type { ReceiptData } from '../lib/printer';
import { isSerialSupported, requestScalePort, readWeight, type ScaleProtocol } from '../lib/scale';

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
  serviceChargeCents?: number;
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

/** Generate a consistent card colour from the category name string. */
const CAT_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#EC4899','#6366F1','#14B8A6'];
function categoryColor(name?: string | null): string {
  if (!name) return '#3B82F6';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CAT_COLORS[Math.abs(h) % CAT_COLORS.length];
}

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
  const navigate = useNavigate();
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
  const [scaleReading, setScaleReading] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [expiryWarnings, setExpiryWarnings] = useState<Array<{ itemId: string; name: string; status: string; expiryDate?: string }>>([]);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  // Fallback: if storeId not in session (email-login users), resolve first store
  const { data: firstStore } = useQuery<{ id: string; name: string }>({
    queryKey: ['first-store', businessId],
    queryFn: () =>
      api.get<Array<{ id: string; name: string }>>(`/business/${businessId}/stores`).then((s) => s[0] ?? null),
    enabled: !!businessId && !storeId,
    staleTime: Infinity,
  });
  const effectiveStoreId = storeId || firstStore?.id || '';
  const effectiveStoreName = firstStore?.name ?? 'Main Store';

  // ─── Data ───────────────────────────────────────────────

  const { data: items = [] } = useQuery<ApiItem[]>({
    queryKey: ['items', businessId, effectiveStoreId, search],
    queryFn: () =>
      api.get<ApiItem[]>(
        `/items?businessId=${businessId}${effectiveStoreId ? `&storeId=${effectiveStoreId}` : ''}${
          search ? `&search=${encodeURIComponent(search)}` : ''
        }`,
      ),
    enabled: !!businessId,
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

  // Business settings — service charge rate + display currencies + business name
  const { data: businessSettings } = useQuery<{ displayCurrencies?: string; serviceChargeRate?: number; name?: string }>({
    queryKey: ['business-settings-fx', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
    select: (d: any) => ({
      displayCurrencies: d.displayCurrencies,
      serviceChargeRate: typeof d.serviceChargeRate === 'number' ? d.serviceChargeRate : 10,
      name: d.name,
    }),
  });
  const serviceChargeRate = businessSettings?.serviceChargeRate ?? 10; // default 10%

  // FEFO suggestion: check if any cart items have batches expiring soon
  const { data: fefoSuggestions = [] } = useQuery<Array<{ itemId: string; itemName: string; daysLeft: number | null; lotNumber: string; status: string }>>({
    queryKey: ['fefo-suggestions', effectiveStoreId, cart.map((c) => c.id).join(',')],
    queryFn: () => {
      const ids = cart.map((c) => c.id).join(',');
      return api.get(`/items/fefo-suggestions?storeId=${effectiveStoreId}&itemIds=${ids}`);
    },
    enabled: !!effectiveStoreId && cart.length > 0,
    staleTime: 30_000,
  });
  const fefoAlerts = fefoSuggestions.filter((s) => s.status !== 'OK' && s.daysLeft !== null && s.daysLeft >= 0);

  const displayCurrencies: string[] = (() => {
    try { return businessSettings?.displayCurrencies ? JSON.parse(businessSettings.displayCurrencies) : []; } catch { return []; }
  })();

  // Stored exchange rates from backend — format: { USD: 129.4 } = KES per 1 foreign unit
  const { data: exchangeRateData } = useQuery<{ rates: Record<string, number>; displayCurrencies: string[] }>({
    queryKey: ['exchange-rates', businessId],
    queryFn: () => api.get(`/business/${businessId}/exchange-rates`),
    enabled: !!businessId,
    staleTime: 30 * 60_000,
    retry: false,
  });
  // fxRates[USD] = 129.4  →  convert: totalKES / 129.4 = totalUSD
  const fxRates: Record<string, number> = exchangeRateData?.rates ?? {};
  // Use stored displayCurrencies from exchange-rate endpoint (falls back to settings)
  const activeCurrencies = (exchangeRateData?.displayCurrencies?.length ?? 0) > 0
    ? exchangeRateData!.displayCurrencies
    : displayCurrencies;

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
      : items.filter((i) => i.category === activeCategory);

  // ─── Totals ────────────────────────────────────────────

  const subtotalCents = cart.reduce((s, i) => s + i.totalCents, 0);
  const serviceChargeCents = serviceChargeEnabled ? Math.round(subtotalCents * serviceChargeRate / 100) : 0;

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
  // VAT is inclusive in item prices — extract the VAT component for display/reporting only
  const vatApplicableTotal = cart.filter((i) => i.vatApplicable).reduce((s, i) => s + i.totalCents, 0);
  const vatApplicableAfterDiscount = vatApplicableTotal * (Math.max(taxBase, 0) / Math.max(subtotalCents, 1));
  const vatCents = Math.round(vatApplicableAfterDiscount * 16 / 116);
  // Total does NOT add vatCents — it is already embedded in item prices
  const totalCents = Math.max(0, taxBase) + serviceChargeCents;

  // ─── Checkout ──────────────────────────────────────────

  const checkoutMutation = useMutation<SaleResult, Error, Array<{ method: string; amountCents: number; reference?: string }>>({
    mutationFn: (payments) => {
      const payload: SalePayload = {
        storeId: effectiveStoreId,
        businessId,
        cashierId: user?.id ?? '',
        type: 'NORMAL',
        priceLevel,
        customerId: customerId ?? undefined,
        items: cart.map((i) => ({ itemId: i.id, quantity: i.quantity })),
        payments,
        serviceChargeCents,  // 0 when toggle is off, >0 when on — backend honours this
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
        businessName: businessSettings?.name ?? 'KASTRA POS',
        storeName: effectiveStoreName,
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
        receiptHeader: (businessSettings as any)?.receiptHeader ?? undefined,
        receiptFooter: (businessSettings as any)?.receiptFooter ?? undefined,
      };
      setReceiptData(receipt);

      // Best-effort eTIMS submission in background
      void api.post<{ success: boolean }>(`/etims/submit/${result.id}`).then((res) => {
        if (res.success) {
          setReceiptData((prev) => prev ? { ...prev, etimsSubmitted: true } : prev);
        }
      }).catch(() => {/* will show watermark if fails */});

      // Broadcast payment complete to pole display
      try {
        const ch = new BroadcastChannel('pos-pole-display');
        ch.postMessage({
          businessName: 'KASTRA POS',
          items: [],
          subtotalCents: 0,
          discountCents: 0,
          vatCents: 0,
          totalCents: result.totalCents,
          status: 'complete',
        });
        ch.close();
        // Return to idle after 4 seconds
        setTimeout(() => {
          try {
            const ch2 = new BroadcastChannel('pos-pole-display');
            ch2.postMessage({ businessName: 'KASTRA POS', items: [], subtotalCents: 0, discountCents: 0, vatCents: 0, totalCents: 0, status: 'idle' });
            ch2.close();
          } catch { /* non-critical */ }
        }, 4000);
      } catch { /* non-critical */ }

      clearCart();
      setLoyaltyDiscountApplied(false);
      setLoyaltyDiscountCents(0);
      setShowPayment(false);
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // ─── Expiry check before opening payment ────────────────

  const handlePayClick = async () => {
    if (cart.length === 0) return;
    const trackExpiry = cart.filter((i) => i.itemType === 'PRODUCT' || i.itemType === 'WEIGHTED');
    if (trackExpiry.length > 0 && effectiveStoreId) {
      try {
        const results = await api.post<Array<{ itemId: string; name: string; status: string; expiryDate?: string }>>(
          '/items/check-expiry',
          { itemIds: trackExpiry.map((i) => i.id), storeId: effectiveStoreId, businessId },
        );
        const issues = results.filter((r) => r.status !== 'OK');
        if (issues.some((r) => r.status === 'EXPIRED')) {
          setExpiryWarnings(issues);
          setShowExpiryWarning(true);
          return; // block checkout
        }
        if (issues.length > 0) {
          setExpiryWarnings(issues);
          setShowExpiryWarning(true);
          return; // show warning, let user confirm
        }
      } catch {
        // Non-critical — proceed if check fails
      }
    }
    setShowPayment(true);
  };

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

  // ─── Camera barcode scanner ──────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setShowCamera(true);
    // Give React time to mount the video element
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (!videoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (result) {
          const text = result.getText();
          handleBarcodeSearch(text);
          // Stop stream after successful scan
          stream.getTracks().forEach((t) => t.stop());
          setShowCamera(false);
        }
        if (err && !(err.message?.includes('No MultiFormat'))) {
          // Suppress the constant "not found" errors from continuous scanning
        }
      });
    } catch (e: unknown) {
      setCameraError(e instanceof Error ? e.message : 'Camera access denied');
    }
  }, [handleBarcodeSearch]);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setCameraError(null);
  }, []);

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
        if (cart.length > 0) void handlePayClick();
      } else if (e.key === 'F2') {
        e.preventDefault();
        setShowCustomerModal(true);
      } else if (e.key === 'F3') {
        e.preventDefault();
        setServiceChargeEnabled((v) => !v);
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) void handlePayClick(); // opens payment modal; cashier picks Split tab
      } else if (e.key === 'F5') {
        e.preventDefault();
        holdCurrentSale();
      } else if (e.key === 'F6') {
        e.preventDefault();
        setShowHeld(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        navigate('/proforma');
      } else if (e.key === 'F8') {
        e.preventDefault();
        navigate('/layaway');
      } else if (e.key === 'Escape') {
        setShowPayment(false);
        setShowHeld(false);
        setShowCustomerModal(false);
        setShowCamera(false);
        setLastReceipt(null);
      }
    },
    [cart.length, holdCurrentSale, serviceChargeEnabled, navigate],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Pole Display Broadcast ──────────────────────────────
  // Store businessId so PoleDisplayPage can fetch its config
  useEffect(() => {
    if (businessId) {
      try { sessionStorage.setItem('pos-business-id', businessId); } catch { /* ignore */ }
    }
  }, [businessId]);

  useEffect(() => {
    try {
      const channel = new BroadcastChannel('pos-pole-display');
      channel.postMessage({
        businessName: businessSettings?.name ?? 'KASTRA POS',
        items: cart.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          totalCents: i.totalCents,
        })),
        subtotalCents,
        discountCents: totalDiscountCents,
        vatCents,
        totalCents,
        status: cart.length > 0 ? 'cart' : 'idle',
        customerName: customerName ?? undefined,
      });
      channel.close();
    } catch {
      // BroadcastChannel not supported — non-critical
    }
  }, [cart, subtotalCents, totalDiscountCents, vatCents, totalCents, customerName]);

  // ─── Render ────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row relative">
      {/* ── Left: Item Grid ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Search + Price Level bar */}
        <div className="bg-white border-b px-3 md:px-4 py-2 md:py-3 flex flex-col xs:flex-row items-stretch xs:items-center gap-2 md:gap-3">
          {/* Row 1 on mobile: search + camera */}
          <div className="relative flex-1 min-w-0">
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
              placeholder='Search or scan barcode'
              className="w-full pl-9 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => void startCamera()}
              title="Scan barcode with camera"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-blue-600 rounded"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          {/* Row 2 on mobile: price level + customer + pole display */}
          <div className="flex items-center gap-2 flex-wrap xs:flex-nowrap">
            {/* Price Level selector — pill button group */}
            <div className="flex items-center border rounded-lg overflow-hidden bg-white flex-shrink-0" title="Price Level">
              {(Object.entries(PRICE_LEVEL_LABELS) as [PriceLevel, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setPriceLevel(val)}
                  className={`px-2 py-1.5 text-xs font-semibold transition-colors ${
                    priceLevel === val
                      ? val === 'RETAIL'    ? 'bg-blue-600 text-white'
                      : val === 'WHOLESALE' ? 'bg-emerald-600 text-white'
                      :                      'bg-purple-600 text-white'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {customerName ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded-lg text-sm min-w-0">
                  <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  <span className="text-blue-700 font-medium truncate max-w-[80px] xs:max-w-[120px]">{customerName}</span>
                  <button onClick={() => setCustomer(null, null)} className="text-blue-400 hover:text-blue-700 flex-shrink-0">
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
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors flex-shrink-0 ${
                      loyaltyDiscountApplied
                        ? 'bg-yellow-500 text-white'
                        : 'bg-yellow-50 text-yellow-700 border border-yellow-300 hover:bg-yellow-100'
                    }`}
                    title={`${loyaltyData.loyaltyPoints} pts = KES ${((loyaltyData.loyaltyPoints * (loyaltyData.program?.redemptionRate ?? 0)) / 100).toFixed(0)}`}
                  >
                    <Star className="w-3 h-3" />
                    {loyaltyDiscountApplied ? `−${(loyaltyDiscountCents / 100).toFixed(0)}` : `${loyaltyData.loyaltyPoints}pts`}
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowCustomerModal(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex-shrink-0"
                title="Select customer (F2)"
              >
                <User className="w-4 h-4" />
                <span className="hidden xs:inline">Customer</span>
              </button>
            )}

            {/* Pole Display button — desktop only */}
            <button
              onClick={() => window.open('/pole-display', '_blank', 'width=1024,height=600,resizable=yes')}
              title="Open customer-facing pole display (2nd screen)"
              className="hidden md:flex p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>
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
        <div className={`flex-1 overflow-y-auto p-3 md:p-4 ${cart.length > 0 ? 'pb-20 md:pb-4' : ''}`}>
          <div className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
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
                    style={{ backgroundColor: categoryColor(item.category) }}
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
        <div className="hidden md:flex bg-gray-50 border-t px-4 py-1.5 gap-3 text-xs text-gray-400 overflow-x-auto">
          <span><kbd className="bg-gray-200 px-1 rounded">/</kbd> Search</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F1</kbd> Pay</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F2</kbd> Customer</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F3</kbd> Service</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F4</kbd> Split</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F5</kbd> Hold</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F6</kbd> Held ({heldSales.length})</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F7</kbd> Proforma</span>
          <span><kbd className="bg-gray-200 px-1 rounded">F8</kbd> Layaway</span>
        </div>
      </div>

      {/* ── Right: Cart ── */}
      <div className={`${
        showCartMobile ? 'fixed inset-0 z-40' : 'hidden'
      } md:relative md:flex md:w-96 bg-white border-l flex-col`}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCartMobile(false)}
              className="md:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <ShoppingCart className="w-5 h-5 text-gray-600" />
            <h2 className="font-bold text-gray-800">Cart ({cart.length})</h2>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
              priceLevel === 'RETAIL'    ? 'bg-blue-100 text-blue-700' :
              priceLevel === 'WHOLESALE' ? 'bg-emerald-100 text-emerald-700' :
                                          'bg-purple-100 text-purple-700'
            }`}>
              {PRICE_LEVEL_LABELS[priceLevel]}
            </span>
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
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* FEFO suggestion banner */}
        {fefoAlerts.length > 0 && (
          <div className="mx-3 mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800">FEFO Notice — sell by expiry:</p>
                {fefoAlerts.slice(0, 3).map((s) => (
                  <p key={s.itemId} className="text-xs text-amber-700 mt-0.5">
                    {s.itemName}: <span className="font-medium">Lot {s.lotNumber}</span> expires in <span className="font-bold">{s.daysLeft}d</span>
                  </p>
                ))}
                {fefoAlerts.length > 3 && (
                  <p className="text-xs text-amber-600 mt-0.5">+{fefoAlerts.length - 3} more</p>
                )}
              </div>
            </div>
          </div>
        )}

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
                  {/* Read Scale button for WEIGHTED items */}
                  {item.itemType === 'WEIGHTED' && isSerialSupported() && (
                    <div className="mt-2">
                      <button
                        onClick={async () => {
                          setScaleReading(true);
                          setScaleError(null);
                          try {
                            const port = await requestScalePort();
                            const reading = await readWeight(port, 'METTLER_TOLEDO' as ScaleProtocol);
                            // Set quantity to weight in grams (or kg as decimal)
                            updateQuantity(item.id, reading.weightGrams / 1000);
                            if (!reading.stable) setScaleError('Weight unstable — reading may be inaccurate');
                          } catch (e: any) {
                            setScaleError(e.message);
                          } finally {
                            setScaleReading(false);
                          }
                        }}
                        disabled={scaleReading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-300 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-100 disabled:opacity-50"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        {scaleReading ? 'Reading…' : 'Read Scale'}
                      </button>
                      {scaleError && <p className="text-xs text-red-500 mt-1">{scaleError}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t">
          <div className="px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>{vatCents > 0 ? 'Subtotal (ex-VAT)' : 'Subtotal'}</span>
              <span>{formatKES(subtotalCents - vatCents)}</span>
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
              <div className="text-right">
                <span className="text-blue-600">{formatKES(totalCents)}</span>
                {activeCurrencies.filter((c) => fxRates[c]).map((c) => (
                  <div key={c} className="text-xs text-gray-400 font-normal">
                    ≈ {c} {(totalCents / 100 / fxRates[c]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setServiceChargeEnabled((v) => !v)}
                className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  serviceChargeEnabled
                    ? 'bg-green-50 border-green-500 text-green-700'
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
                title="Toggle service charge (F3)"
              >
                Svc {serviceChargeRate}% {serviceChargeEnabled ? '✓' : ''}
              </button>
            </div>
            <button
              onClick={() => void handlePayClick()}
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

      {/* Floating mobile bottom bar — Cart + Pay (Mobile Only) */}
      {cart.length > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex gap-0 shadow-2xl border-t bg-white">
          <button
            onClick={() => setShowCartMobile(true)}
            className="flex-1 flex items-center justify-center gap-2 py-4 bg-gray-50 text-gray-700 font-semibold text-sm border-r"
          >
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {cart.length}
              </span>
            </div>
            Cart
          </button>
          <button
            onClick={() => void handlePayClick()}
            disabled={checkoutMutation.isPending}
            className="flex-[2] py-4 bg-blue-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {checkoutMutation.isPending ? 'Processing…' : `Pay ${formatKES(totalCents)}`}
          </button>
        </div>
      )}

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

      {/* ── Camera Barcode Scanner ── */}
      {showCamera && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold">Scan Barcode</span>
              <button onClick={stopCamera} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative bg-black">
              <video ref={videoRef} className="w-full" playsInline muted />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-4 border-blue-400 rounded-lg opacity-70" />
              </div>
            </div>
            {cameraError && (
              <div className="px-4 py-3 text-sm text-red-600 bg-red-50 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {cameraError}
              </div>
            )}
            <p className="text-center text-xs text-gray-500 py-2">Point camera at barcode to scan automatically</p>
          </div>
        </div>
      )}

      {/* ── Expiry Warning Modal ── */}
      {showExpiryWarning && expiryWarnings.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Expiry Warning</h3>
                <p className="text-sm text-gray-500">Some items have expiry issues</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {expiryWarnings.map((w) => (
                <div key={w.itemId} className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
                  w.status === 'EXPIRED' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
                }`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{w.name}</span>
                    <span className="ml-1 text-xs">
                      {w.status === 'EXPIRED'
                        ? `EXPIRED ${w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : ''}`
                        : `Expires ${w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : 'soon'}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {expiryWarnings.some((w) => w.status === 'EXPIRED') ? (
              <div className="space-y-2">
                <p className="text-xs text-red-600 text-center">Expired items cannot be sold. Remove them from cart first.</p>
                <button
                  onClick={() => setShowExpiryWarning(false)}
                  className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
                >
                  Go Back to Cart
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowExpiryWarning(false)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowExpiryWarning(false); setShowPayment(true); }}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600"
                >
                  Sell Anyway
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
