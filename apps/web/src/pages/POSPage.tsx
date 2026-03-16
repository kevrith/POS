import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, X, ShoppingCart } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { api } from '../lib/api';
import { usePOSStore, type ApiItem, type PriceLevel, type CartItem } from '../stores/pos';
import { useAuthStore } from '../stores/auth';
import PaymentModal from '../components/PaymentModal';
import HeldSalesModal from '../components/HeldSalesModal';
import CustomerSelectModal from '../components/CustomerSelectModal';
import PrintModal from '../components/PrintModal';
import ItemGrid from '../components/pos/ItemGrid';
import CartPanel from '../components/pos/CartPanel';
import AgeGateModal from '../components/pos/AgeGateModal';
import PriceOverrideModal from '../components/pos/PriceOverrideModal';
import ExpiryWarningModal from '../components/pos/ExpiryWarningModal';
import CameraModal from '../components/pos/CameraModal';
import type { ReceiptData } from '../lib/printer';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  tipCents?: number;
}

interface Promotion {
  id: string;
  name: string;
  type: string;
  discountType: string;
  discountValue: number;
  minPurchaseCents?: number;
  maxDiscountCents?: number;
  applicableItems: string;
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

/**
 * GS1-128 EAN-13 weight/price embedded barcodes start with '2'.
 * Format: 2PPPPPWWWWWC (13 digits) — PPPPP=PLU, WWWWW=weight/price, C=check digit
 */
function parseGS1Weight(barcode: string): { plu: string; weightGrams: number; priceCents: number | null } | null {
  if (barcode.length !== 13 || !barcode.startsWith('2')) return null;
  const plu = barcode.slice(1, 6);
  const raw = barcode.slice(6, 11);
  const prefix = parseInt(barcode.slice(0, 2));
  if (prefix >= 20 && prefix <= 24) return { plu, weightGrams: parseInt(raw), priceCents: null };
  if (prefix >= 25 && prefix <= 29) return { plu, weightGrams: 0, priceCents: parseInt(raw) };
  return null;
}

function formatKES(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function POSPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const {
    cart, addToCart, addWeightedToCart, removeFromCart, updateQuantity, updateDiscount, updateUnitPrice, clearCart,
    priceLevel, setPriceLevel,
    customerId, customerName, setCustomer,
    heldSales, holdCurrentSale, resumeHeldSale, discardHeldSale,
  } = usePOSStore();

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [showPayment, setShowPayment] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<SaleResult | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [loyaltyDiscountApplied, setLoyaltyDiscountApplied] = useState(false);
  const [loyaltyDiscountCents, setLoyaltyDiscountCents] = useState(0);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [barcodeToast, setBarcodeToast] = useState<string | null>(null);
  const [tipInput, setTipInput] = useState('');
  const [expiryWarnings, setExpiryWarnings] = useState<Array<{ itemId: string; name: string; status: string; expiryDate?: string }>>([]);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  // Age gate
  const [pendingAgeItem, setPendingAgeItem] = useState<ApiItem | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  // Price override
  const [priceOverrideItem, setPriceOverrideItem] = useState<CartItem | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  // ─── Data queries ─────────────────────────────────────────────────────────

  const { data: firstStore } = useQuery<{ id: string; name: string }>({
    queryKey: ['first-store', businessId],
    queryFn: () =>
      api.get<Array<{ id: string; name: string }>>(`/business/${businessId}/stores`).then((s) => s[0] ?? null),
    enabled: !!businessId && !storeId,
    staleTime: Infinity,
  });
  const effectiveStoreId = storeId || firstStore?.id || '';
  const effectiveStoreName = firstStore?.name ?? 'Main Store';

  const { data: items = [] } = useQuery<ApiItem[]>({
    queryKey: ['items', businessId, effectiveStoreId, search],
    queryFn: () =>
      api.get<ApiItem[]>(
        `/items?businessId=${businessId}${effectiveStoreId ? `&storeId=${effectiveStoreId}` : ''}&activeOnly=true${
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

  const { data: businessSettings } = useQuery<{
    displayCurrencies?: string;
    serviceChargeRate?: number;
    serviceChargeDefault?: boolean;
    taxType?: 'VAT' | 'TOT' | 'NONE';
    name?: string;
    enableCashDrawer?: boolean;
    enableBarcodeScanner?: boolean;
    enablePoleDisplay?: boolean;
  }>({
    queryKey: ['business-settings-fx', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
    select: (d: any) => ({
      displayCurrencies: d.displayCurrencies,
      serviceChargeRate: typeof d.serviceChargeRate === 'number' ? d.serviceChargeRate : 10,
      serviceChargeDefault: d.serviceChargeDefault ?? false,
      taxType: d.taxType ?? 'VAT',
      name: d.name,
      enableCashDrawer: d.enableCashDrawer ?? false,
      enableBarcodeScanner: d.enableBarcodeScanner ?? true,
      enablePoleDisplay: d.enablePoleDisplay ?? false,
    }),
  });
  const serviceChargeRate = businessSettings?.serviceChargeRate ?? 10;
  const taxType = businessSettings?.taxType ?? 'VAT';
  const enableCashDrawer = businessSettings?.enableCashDrawer ?? false;
  const enableBarcodeScanner = businessSettings?.enableBarcodeScanner ?? true;
  const enablePoleDisplay = businessSettings?.enablePoleDisplay ?? false;

  // Sync service charge toggle from business default when settings first load
  const serviceChargeDefaultRef = useRef(false);
  useEffect(() => {
    if (businessSettings?.serviceChargeDefault !== undefined &&
        businessSettings.serviceChargeDefault !== serviceChargeDefaultRef.current) {
      serviceChargeDefaultRef.current = businessSettings.serviceChargeDefault;
      setServiceChargeEnabled(businessSettings.serviceChargeDefault);
    }
  }, [businessSettings?.serviceChargeDefault]);

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

  const { data: exchangeRateData } = useQuery<{ rates: Record<string, number>; displayCurrencies: string[] }>({
    queryKey: ['exchange-rates', businessId],
    queryFn: () => api.get(`/business/${businessId}/exchange-rates`),
    enabled: !!businessId,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const fxRates: Record<string, number> = exchangeRateData?.rates ?? {};
  const activeCurrencies = (exchangeRateData?.displayCurrencies?.length ?? 0) > 0
    ? exchangeRateData!.displayCurrencies
    : (() => {
        try { return businessSettings?.displayCurrencies ? JSON.parse(businessSettings.displayCurrencies) : []; } catch { return []; }
      })();

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

  useEffect(() => {
    setLoyaltyDiscountApplied(false);
    setLoyaltyDiscountCents(0);
    setCustomerPhone(null);
  }, [customerId]);

  // ─── Totals ───────────────────────────────────────────────────────────────

  const filteredItems = activeCategory === 'all' ? items : items.filter((i) => i.category === activeCategory);
  const subtotalCents = cart.reduce((s, i) => s + i.totalCents, 0);
  const serviceChargeCents = serviceChargeEnabled ? Math.round(subtotalCents * serviceChargeRate / 100) : 0;
  const cartItemIds = cart.map((i) => i.id);
  const appliedPromotion = activePromotions.find((p) => {
    if (p.minPurchaseCents && subtotalCents < p.minPurchaseCents) return false;
    const ids: string[] = (() => { try { return JSON.parse(p.applicableItems) as string[]; } catch { return []; } })();
    if (ids.length > 0 && !cartItemIds.some(id => ids.includes(id))) return false;
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
  const vatApplicableTotal = cart.filter((i) => i.vatApplicable).reduce((s, i) => s + i.totalCents, 0);
  const vatApplicableAfterDiscount = vatApplicableTotal * (Math.max(taxBase, 0) / Math.max(subtotalCents, 1));
  // Only extract tax if the business has that tax type enabled
  const vatCents  = taxType === 'VAT'  ? Math.round(vatApplicableAfterDiscount * 16 / 116) : 0;
  const totCentsDisplay = taxType === 'TOT' ? Math.round(Math.max(taxBase, 0) * 3 / 103) : 0;
  const tipCents = Math.round(parseFloat(tipInput || '0') * 100);
  const totalCents = Math.max(0, taxBase) + serviceChargeCents + tipCents;

  // ─── Checkout ─────────────────────────────────────────────────────────────

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
        serviceChargeCents,
        ...(tipCents > 0 && { tipCents }),
        ...(totalDiscountCents > 0 && { discountCents: totalDiscountCents, promotionId: appliedPromotion?.id }),
      };
      return api.post<SaleResult>('/sales/checkout', payload);
    },
    onSuccess: (result) => {
      setLastReceipt(result);

      const gcPayment = (checkoutMutation.variables ?? []).find((p) => p.method === 'GIFT_CARD');
      if (gcPayment?.reference) {
        void api.post(`/gift-cards/${gcPayment.reference}/redeem`, { amountCents: gcPayment.amountCents, saleId: result.id });
      }
      if (customerId) {
        void api.post('/loyalty/earn', { customerId, saleCents: subtotalCents, saleId: result.id })
          .then(() => { void qc.invalidateQueries({ queryKey: ['loyalty-customer', customerId] }); })
          .catch(() => {});
      }

      const receipt: ReceiptData = {
        receiptNumber: result.receiptNumber,
        businessName: businessSettings?.name ?? 'KASTRA POS',
        storeName: effectiveStoreName,
        date: new Date().toISOString(),
        cashierName: user?.name ?? 'Cashier',
        customerName: customerName ?? undefined,
        customerPhone: customerPhone ?? undefined,
        items: cart.map(item => ({
          name: item.name, quantity: item.quantity,
          unitPriceCents: item.unitPriceCents, totalCents: item.totalCents,
          discountPercent: item.discountPercent,
        })),
        subtotalCents, serviceChargeCents,
        vatCents,
        ...(totCentsDisplay > 0 && { totCents: totCentsDisplay }),
        ...(tipCents > 0 && { tipCents }),
        totalCents,
        payments: checkoutMutation.variables ?? [],
        etimsSubmitted: false,
        saleId: result.id,
        receiptHeader: (businessSettings as any)?.receiptHeader ?? undefined,
        receiptFooter: (businessSettings as any)?.receiptFooter ?? undefined,
      };
      setReceiptData(receipt);

      void api.post<{ success: boolean }>(`/etims/submit/${result.id}`).then((res) => {
        if (res.success) setReceiptData((prev) => prev ? { ...prev, etimsSubmitted: true } : prev);
      }).catch(() => {});

      if (enablePoleDisplay) try {
        const ch = new BroadcastChannel('pos-pole-display');
        ch.postMessage({ businessName: 'KASTRA POS', items: [], subtotalCents: 0, discountCents: 0, vatCents: 0, totalCents: result.totalCents, status: 'complete' });
        ch.close();
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
      setTipInput('');
      setAgeConfirmed(false);
      setShowPayment(false);
      void qc.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // ─── Expiry check ─────────────────────────────────────────────────────────

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
        if (issues.length > 0) { setExpiryWarnings(issues); setShowExpiryWarning(true); return; }
      } catch { /* proceed if check fails */ }
    }
    setShowPayment(true);
  };

  // ─── Barcode / quick-entry ────────────────────────────────────────────────

  const handleBarcodeSearch = useCallback((raw: string) => {
    const qkMatch = raw.match(/^(\d+)[x×*](\d+)$/i);
    if (qkMatch) {
      const qty = parseInt(qkMatch[1]);
      const priceCents = parseInt(qkMatch[2]) * 100;
      const hit = items.find(i => i.retailPriceCents === priceCents);
      if (hit) { for (let k = 0; k < qty; k++) addToCart(hit); setSearch(''); return; }
    }
    const gs1 = parseGS1Weight(raw);
    if (gs1) {
      const hit = items.find(i => i.barcode === gs1.plu || i.barcode?.startsWith(gs1.plu) || i.sku === gs1.plu);
      if (hit) {
        const tareGrams = hit.tareWeightGrams ?? 0;
        if (gs1.weightGrams > 0) {
          const netGrams = Math.max(0, gs1.weightGrams - tareGrams);
          addWeightedToCart(hit, netGrams);
          const netKg = (netGrams / 1000).toFixed(3);
          const msg = tareGrams > 0 ? `Scanned: ${hit.name} — Net: ${netKg} kg (tare: ${(tareGrams / 1000).toFixed(3)} kg deducted)` : `Scanned: ${hit.name} — ${netKg} kg`;
          setBarcodeToast(msg); setTimeout(() => setBarcodeToast(null), 3500);
        } else if (gs1.priceCents !== null) {
          addWeightedToCart(hit, 0, gs1.priceCents);
          setBarcodeToast(`Scanned: ${hit.name} — KES ${(gs1.priceCents / 100).toFixed(2)}`);
          setTimeout(() => setBarcodeToast(null), 3500);
        }
        setSearch(''); return;
      }
    }
    const item = items.find(i => i.barcode === raw);
    if (item) { addToCart(item); setSearch(''); }
  }, [items, addToCart, addWeightedToCart]);

  // ─── Camera barcode scanner ───────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setShowCamera(true);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    if (!videoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      reader.decodeFromStream(stream, videoRef.current, (result, err) => {
        if (result) {
          handleBarcodeSearch(result.getText());
          stream.getTracks().forEach((t) => t.stop());
          setShowCamera(false);
        }
        if (err && !(err.message?.includes('No MultiFormat'))) { /* suppress continuous scan errors */ }
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

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    else if (e.key === 'F1') { e.preventDefault(); if (cart.length > 0) void handlePayClick(); }
    else if (e.key === 'F2') { e.preventDefault(); setShowCustomerModal(true); }
    else if (e.key === 'F3') { e.preventDefault(); setServiceChargeEnabled((v) => !v); }
    else if (e.key === 'F4') { e.preventDefault(); if (cart.length > 0) void handlePayClick(); }
    else if (e.key === 'F5') { e.preventDefault(); holdCurrentSale(); }
    else if (e.key === 'F6') { e.preventDefault(); setShowHeld(true); }
    else if (e.key === 'F7') { e.preventDefault(); navigate('/proforma'); }
    else if (e.key === 'F8') { e.preventDefault(); navigate('/layaway'); }
    else if (e.key === 'Escape') {
      setShowPayment(false); setShowHeld(false); setShowCustomerModal(false);
      setShowCamera(false); setLastReceipt(null);
    }
  }, [cart.length, holdCurrentSale, navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ─── Store businessId + Pole display broadcast ───────────────────────────

  useEffect(() => {
    if (businessId) { try { sessionStorage.setItem('pos-business-id', businessId); } catch { /* ignore */ } }
  }, [businessId]);

  useEffect(() => {
    if (!enablePoleDisplay) return;
    try {
      const channel = new BroadcastChannel('pos-pole-display');
      channel.postMessage({
        businessName: businessSettings?.name ?? 'KASTRA POS',
        items: cart.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents, totalCents: i.totalCents })),
        subtotalCents, discountCents: totalDiscountCents, vatCents, totalCents,
        status: cart.length > 0 ? 'cart' : 'idle',
        customerName: customerName ?? undefined,
      });
      channel.close();
    } catch { /* BroadcastChannel not supported */ }
  }, [cart, subtotalCents, totalDiscountCents, vatCents, totalCents, customerName, enablePoleDisplay]);

  // ─── Loyalty toggle ───────────────────────────────────────────────────────

  const handleToggleLoyalty = async () => {
    if (loyaltyDiscountApplied) {
      setLoyaltyDiscountApplied(false);
      setLoyaltyDiscountCents(0);
    } else {
      try {
        const result = await api.post<{ discountCents: number }>('/loyalty/redeem', {
          customerId, points: loyaltyData?.loyaltyPoints, saleId: 'preview',
        });
        setLoyaltyDiscountCents(result.discountCents);
        setLoyaltyDiscountApplied(true);
      } catch { /* insufficient points */ }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row relative">
      {/* GS1 barcode scan toast */}
      {barcodeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-700 text-white px-6 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm text-center">
          {barcodeToast}
        </div>
      )}

      {/* Left: Item Grid */}
      <ItemGrid
        items={filteredItems}
        categories={categories}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        priceLevel={priceLevel}
        setPriceLevel={setPriceLevel}
        search={search}
        setSearch={setSearch}
        searchRef={searchRef}
        ageConfirmed={ageConfirmed}
        heldSalesCount={heldSales.length}
        customerName={customerName}
        loyaltyData={loyaltyData}
        loyaltyDiscountApplied={loyaltyDiscountApplied}
        loyaltyDiscountCents={loyaltyDiscountCents}
        onAddItem={addToCart}
        onBarcodeSearch={handleBarcodeSearch}
        onOpenCamera={() => void startCamera()}
        enableBarcodeScanner={enableBarcodeScanner}
        onSelectCustomer={() => setShowCustomerModal(true)}
        onClearCustomer={() => setCustomer(null, null)}
        onToggleLoyalty={() => void handleToggleLoyalty()}
        onAgeRestrictedItem={setPendingAgeItem}
      />

      {/* Right: Cart */}
      <CartPanel
        cart={cart}
        priceLevel={priceLevel}
        showCartMobile={showCartMobile}
        setShowCartMobile={setShowCartMobile}
        heldSalesCount={heldSales.length}
        onHold={() => holdCurrentSale()}
        onShowHeld={() => setShowHeld(true)}
        onClear={clearCart}
        onRemoveItem={removeFromCart}
        onUpdateQuantity={updateQuantity}
        onUpdateDiscount={updateDiscount}
        onOpenPriceOverride={setPriceOverrideItem}
        fefoAlerts={fefoAlerts}
        subtotalCents={subtotalCents}
        vatCents={vatCents}
        totCents={totCentsDisplay}
        taxType={taxType}
        promoDiscountCents={promoDiscountCents}
        appliedPromotion={appliedPromotion}
        serviceChargeEnabled={serviceChargeEnabled}
        setServiceChargeEnabled={setServiceChargeEnabled}
        serviceChargeRate={serviceChargeRate}
        serviceChargeCents={serviceChargeCents}
        tipInput={tipInput}
        setTipInput={setTipInput}
        tipCents={tipCents}
        totalCents={totalCents}
        fxRates={fxRates}
        activeCurrencies={activeCurrencies}
        isPaying={checkoutMutation.isPending}
        payError={checkoutMutation.error?.message}
        onPay={() => void handlePayClick()}
      />

      {/* Mobile bottom bar */}
      {cart.length > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex shadow-2xl border-t bg-white">
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

      {/* Sale complete toast */}
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
                      businessId, phone: customerPhone,
                      receiptNumber: lastReceipt.receiptNumber, totalCents: lastReceipt.totalCents,
                      channel: 'whatsapp',
                    });
                  } finally { setSendingWhatsApp(false); }
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
        <PrintModal receipt={receiptData} onClose={() => setShowPrintModal(false)} enableCashDrawer={enableCashDrawer} />
      )}

      {pendingAgeItem && (
        <AgeGateModal
          item={pendingAgeItem}
          onConfirm={() => {
            setAgeConfirmed(true);
            addToCart(pendingAgeItem);
            setPendingAgeItem(null);
          }}
          onCancel={() => setPendingAgeItem(null)}
        />
      )}

      {priceOverrideItem && (
        <PriceOverrideModal
          item={priceOverrideItem}
          userRole={user?.role}
          businessId={businessId}
          onApply={(itemId, priceCents) => { updateUnitPrice(itemId, priceCents); setPriceOverrideItem(null); }}
          onCancel={() => setPriceOverrideItem(null)}
        />
      )}

      {showCamera && (
        <CameraModal
          videoRef={videoRef}
          cameraError={cameraError}
          onClose={stopCamera}
        />
      )}

      {showExpiryWarning && expiryWarnings.length > 0 && (
        <ExpiryWarningModal
          warnings={expiryWarnings}
          onClose={() => setShowExpiryWarning(false)}
          onProceed={() => { setShowExpiryWarning(false); setShowPayment(true); }}
        />
      )}
    </div>
  );
}
