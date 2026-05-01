import { useState } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, X, PauseCircle, PlayCircle, AlertTriangle, Edit2, Scale, UserPlus, FileText } from 'lucide-react';
import type { CartItem, PriceLevel } from '../../stores/pos';
import { isSerialSupported, requestScalePort, readWeight, type ScaleProtocol } from '../../lib/scale';

function formatKES(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  VIP: 'VIP',
};

interface Promotion {
  id: string;
  name: string;
}

interface FEFOAlert {
  itemId: string;
  itemName: string;
  daysLeft: number | null;
  lotNumber: string;
  status: string;
}

interface Props {
  cart: CartItem[];
  priceLevel: PriceLevel;
  showCartMobile: boolean;
  setShowCartMobile: (v: boolean) => void;
  heldSalesCount: number;
  onHold: () => void;
  onShowHeld: () => void;
  onClear: () => void;
  onRemoveItem: (id: string) => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onUpdateDiscount: (id: string, pct: number) => void;
  onOpenPriceOverride: (item: CartItem) => void;
  fefoAlerts: FEFOAlert[];
  subtotalCents: number;
  vatCents: number;
  totCents?: number;
  taxType?: 'VAT' | 'TOT' | 'NONE';
  promoDiscountCents: number;
  appliedPromotion: Promotion | undefined;
  serviceChargeEnabled: boolean;
  setServiceChargeEnabled: (v: boolean) => void;
  serviceChargeRate: number;
  serviceChargeCents: number;
  tipInput: string;
  setTipInput: (v: string) => void;
  tipCents: number;
  totalCents: number;
  fxRates: Record<string, number>;
  activeCurrencies: string[];
  manualDiscountCents: number;
  setManualDiscountCents: (v: number) => void;
  isPaying: boolean;
  payError?: string;
  onPay: () => void;
  onSaveAsInvoice?: () => void;
}

export default function CartPanel({
  cart, priceLevel, showCartMobile, setShowCartMobile,
  heldSalesCount, onHold, onShowHeld, onClear,
  onRemoveItem, onUpdateQuantity, onUpdateDiscount, onOpenPriceOverride,
  fefoAlerts, subtotalCents, vatCents, totCents = 0, taxType = 'VAT', promoDiscountCents, appliedPromotion,
  serviceChargeEnabled, setServiceChargeEnabled, serviceChargeRate, serviceChargeCents,
  tipInput, setTipInput, tipCents, totalCents, fxRates, activeCurrencies,
  manualDiscountCents, setManualDiscountCents,
  isPaying, payError, onPay, onSaveAsInvoice,
}: Props) {
  return (
    <>
      {/* Mobile backdrop */}
      {showCartMobile && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowCartMobile(false)}
        />
      )}

    <div className={`
      ${showCartMobile
        ? 'fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl max-h-[88vh] flex flex-col'
        : 'hidden'}
      md:relative md:flex md:rounded-none md:max-h-none md:w-80 lg:w-96
      bg-slate-900 border-t md:border-t-0 md:border-l border-slate-700 flex-col md:overflow-hidden
    `}>
      {/* Mobile drag handle */}
      <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 bg-slate-600 rounded-full" />
      </div>

      {/* Cart header */}
      <div className="px-4 py-2.5 md:py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCartMobile(false)}
            className="md:hidden p-1.5 text-slate-500 hover:text-slate-300 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
          <ShoppingCart className="w-5 h-5 text-slate-400" />
          <h2 className="font-bold text-slate-100">Cart ({cart.length})</h2>
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
            priceLevel === 'RETAIL'    ? 'bg-blue-900/50 text-blue-300' :
            priceLevel === 'WHOLESALE' ? 'bg-emerald-900/50 text-emerald-300' :
                                        'bg-purple-900/50 text-purple-300'
          }`}>
            {PRICE_LEVEL_LABELS[priceLevel]}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onHold}
            disabled={cart.length === 0}
            title="Hold sale (F5)"
            className="p-1.5 text-slate-500 hover:text-orange-400 hover:bg-orange-900/30 rounded-lg disabled:opacity-30 transition-colors"
          >
            <PauseCircle className="w-5 h-5" />
          </button>
          {heldSalesCount > 0 && (
            <button
              onClick={onShowHeld}
              title="Held sales (F6)"
              className="relative p-1.5 text-slate-500 hover:text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
            >
              <PlayCircle className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {heldSalesCount}
              </span>
            </button>
          )}
          <button
            onClick={onClear}
            disabled={cart.length === 0}
            title="Clear cart"
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/30 rounded-lg disabled:opacity-30 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* FEFO suggestion banner */}
      {fefoAlerts.length > 0 && (
        <div className="mx-3 mt-2 p-2.5 bg-amber-900/30 border border-amber-700/50 rounded-xl">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-300">FEFO Notice — sell by expiry:</p>
              {fefoAlerts.slice(0, 3).map((s) => (
                <p key={s.itemId} className="text-xs text-amber-400 mt-0.5">
                  {s.itemName}: <span className="font-medium">Lot {s.lotNumber}</span> expires in <span className="font-bold">{s.daysLeft}d</span>
                </p>
              ))}
              {fefoAlerts.length > 3 && (
                <p className="text-xs text-amber-500 mt-0.5">+{fefoAlerts.length - 3} more</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Cart is empty</p>
            <p className="text-xs mt-1 text-slate-700">Tap items to add</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {cart.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onRemove={() => onRemoveItem(item.id)}
                onQuantityChange={(qty) => onUpdateQuantity(item.id, qty)}
                onDiscountChange={(pct) => onUpdateDiscount(item.id, pct)}
                onPriceOverride={() => onOpenPriceOverride(item)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Totals + actions */}
      <div className="border-t border-slate-800 flex-shrink-0">
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>
              {taxType === 'VAT' && vatCents > 0 ? 'Subtotal (ex-VAT)'
               : taxType === 'TOT' && totCents > 0 ? 'Subtotal (ex-TOT)'
               : 'Subtotal'}
            </span>
            <span>{formatKES(subtotalCents - vatCents - totCents)}</span>
          </div>
          {promoDiscountCents > 0 && (
            <div className="flex justify-between text-green-400 font-medium">
              <span className="flex items-center gap-1">
                <span className="text-xs bg-green-900/50 text-green-400 px-1.5 py-0.5 rounded border border-green-700/50">PROMO</span>
                {appliedPromotion?.name}
              </span>
              <span>-{formatKES(promoDiscountCents)}</span>
            </div>
          )}
          {/* Manual sale discount — bidirectional % ↔ KES */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-xs whitespace-nowrap w-14">Discount</span>
              <div className="flex items-center gap-1 flex-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={subtotalCents > 0 ? parseFloat(((manualDiscountCents / subtotalCents) * 100).toFixed(1)) || '' : ''}
                  onChange={(e) => {
                    const pct = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                    setManualDiscountCents(Math.round(subtotalCents * pct / 100));
                  }}
                  placeholder="0"
                  className="w-14 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-orange-300 placeholder-slate-600 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none text-right"
                />
                <span className="text-slate-600 text-xs">%</span>
                <span className="text-slate-700 text-xs">/</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={manualDiscountCents > 0 ? (manualDiscountCents / 100).toFixed(0) : ''}
                  onChange={(e) => {
                    const amt = Math.max(0, parseFloat(e.target.value) || 0);
                    setManualDiscountCents(Math.min(Math.round(amt * 100), subtotalCents));
                  }}
                  placeholder="0"
                  className="w-16 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-orange-300 placeholder-slate-600 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none text-right"
                />
                <span className="text-slate-600 text-xs">KES</span>
                {manualDiscountCents > 0 && (
                  <button onClick={() => setManualDiscountCents(0)} className="text-slate-600 hover:text-red-400 ml-auto">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            {manualDiscountCents > 0 && (
              <div className="flex justify-between text-orange-400 text-xs font-semibold">
                <span>Sale discount</span>
                <span>-{formatKES(manualDiscountCents)}</span>
              </div>
            )}
          </div>
          {serviceChargeCents > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Service ({serviceChargeRate}%)</span>
              <span>{formatKES(serviceChargeCents)}</span>
            </div>
          )}
          {taxType === 'VAT' && vatCents > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>VAT (16%)</span>
              <span>{formatKES(vatCents)}</span>
            </div>
          )}
          {taxType === 'TOT' && totCents > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>TOT (3%)</span>
              <span>{formatKES(totCents)}</span>
            </div>
          )}
          {tipCents > 0 && (
            <div className="flex justify-between text-slate-400">
              <span>Tip/Gratuity</span>
              <span>{formatKES(tipCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-slate-700 pt-2">
            <span className="text-slate-100">Total</span>
            <div className="text-right">
              <span className="text-blue-400">{formatKES(totalCents)}</span>
              {activeCurrencies.filter((c) => fxRates[c]).map((c) => (
                <div key={c} className="text-xs text-slate-500 font-normal">
                  ≈ {c} {(totalCents / 100 / fxRates[c]).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                serviceChargeEnabled
                  ? 'bg-green-900/40 border-green-600 text-green-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
              title="Toggle service charge (F3)"
            >
              Svc {serviceChargeRate}% {serviceChargeEnabled ? '✓' : ''}
            </button>
            <button
              onClick={() => { onHold(); }}
              disabled={cart.length === 0}
              title="Hold current sale and start next customer"
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-orange-700/50 text-orange-400 hover:bg-orange-900/30 disabled:opacity-30 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Next
            </button>
          </div>

          {/* Tip input */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Tip (KES)</span>
              <input
                type="number"
                min="0"
                step="10"
                value={tipInput}
                onChange={(e) => setTipInput(e.target.value)}
                placeholder="0.00"
                className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              {tipInput && (
                <button onClick={() => setTipInput('')} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5">
              {[50, 100, 200].map((t) => (
                <button
                  key={t}
                  onClick={() => setTipInput(String(t))}
                  className="flex-1 py-1 text-xs border border-slate-700 rounded-lg hover:bg-slate-700 text-slate-400 transition-colors"
                >
                  +{t}
                </button>
              ))}
            </div>
          </div>

          {onSaveAsInvoice && (
            <button
              onClick={onSaveAsInvoice}
              disabled={cart.length === 0}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <FileText className="w-4 h-4" />
              Save as Invoice / Proforma
            </button>
          )}
          <button
            onClick={onPay}
            disabled={cart.length === 0 || isPaying}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
          >
            {isPaying
              ? 'Processing…'
              : cart.length > 0
                ? `Pay ${formatKES(totalCents)}  (F1)`
                : 'Pay  (F1)'}
          </button>
          {payError && (
            <p className="mt-2 text-xs text-red-400 text-center">{payError}</p>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// ─── CartItem row (internal) ─────────────────────────────────────────────────

interface CartItemRowProps {
  item: CartItem;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
  onDiscountChange: (pct: number) => void;
  onPriceOverride: () => void;
}

function CartItemRow({ item, onRemove, onQuantityChange, onDiscountChange, onPriceOverride }: CartItemRowProps) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyInput, setQtyInput] = useState(String(item.quantity));
  const isFractional = item.itemType === 'WEIGHTED' || (item as any).isFractional;

  const commitQty = () => {
    const v = parseFloat(qtyInput);
    if (!isNaN(v) && v > 0) onQuantityChange(v);
    else setQtyInput(String(item.quantity));
    setEditingQty(false);
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="text-sm font-medium text-slate-200 truncate">{item.name}</p>
          <p className="text-xs text-slate-500">
            {`KES ${(item.unitPriceCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`}
            {isFractional ? ` / ${(item as any).unitLabel ?? 'unit'}` : ' each'}
            {item.discountPercent && item.discountPercent > 0 && (
              <span className="ml-1 text-green-400">(-{item.discountPercent}%)</span>
            )}
          </p>
        </div>
        <button onClick={onRemove} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onQuantityChange(Math.max(0, item.quantity - (isFractional ? 0.1 : 1)))}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <Minus className="w-3 h-3" />
          </button>
          {editingQty ? (
            <input
              autoFocus
              type="number"
              min="0"
              step={isFractional ? '0.001' : '1'}
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => { if (e.key === 'Enter') commitQty(); if (e.key === 'Escape') { setEditingQty(false); setQtyInput(String(item.quantity)); } }}
              className="w-16 text-center text-sm font-semibold bg-slate-700 border border-blue-500 rounded text-slate-100 outline-none px-1 py-0.5"
            />
          ) : (
            <button
              onClick={() => { setQtyInput(String(item.quantity)); setEditingQty(true); }}
              className="w-16 text-center text-sm font-semibold text-slate-200 hover:text-blue-400 hover:underline transition-colors"
              title="Click to enter exact quantity"
            >
              {isFractional ? item.quantity.toFixed(3) : item.quantity}
            </button>
          )}
          <button
            onClick={() => onQuantityChange(item.quantity + (isFractional ? 0.1 : 1))}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-colors"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <span className="font-bold text-slate-100">
          {`KES ${(item.totalCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        {/* Per-item discount — bidirectional % ↔ KES */}
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={item.discountPercent ? parseFloat(item.discountPercent.toFixed(1)) : ''}
          onChange={(e) => onDiscountChange(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
          placeholder="0"
          className="w-14 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-orange-300 placeholder-slate-600 focus:ring-1 focus:ring-orange-500 outline-none text-right"
        />
        <span className="text-slate-600 text-xs">%</span>
        <span className="text-slate-700 text-xs">/</span>
        <input
          type="number"
          min="0"
          step="1"
          value={item.discountPercent && item.discountPercent > 0
            ? Math.round(item.unitPriceCents * item.quantity * item.discountPercent / 100 / 100)
            : ''}
          onChange={(e) => {
            const amt = Math.max(0, parseFloat(e.target.value) || 0);
            const base = item.unitPriceCents * item.quantity;
            const pct = base > 0 ? Math.min(100, (amt * 100 / base) * 100) : 0;
            onDiscountChange(Math.round(pct * 10) / 10);
          }}
          placeholder="0"
          className="w-16 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded text-orange-300 placeholder-slate-600 focus:ring-1 focus:ring-orange-500 outline-none text-right"
        />
        <span className="text-slate-600 text-xs">KES</span>
        <button
          onClick={onPriceOverride}
          className="flex items-center gap-1 px-2 py-1 text-xs border border-amber-700/50 text-amber-400 rounded hover:bg-amber-900/30 transition-colors ml-auto"
          title="Override price"
        >
          <Edit2 className="w-3 h-3" />
          Price
        </button>
      </div>
      {/* Scale button for WEIGHTED items */}
      {item.itemType === 'WEIGHTED' && isSerialSupported() && (
        <ScaleButton item={item} onQuantityChange={onQuantityChange} />
      )}
    </div>
  );
}

// ─── Scale reading button (isolated to keep CartItemRow clean) ────────────────

function ScaleButton({ onQuantityChange }: { item: CartItem; onQuantityChange: (qty: number) => void }) {
  const [reading, setReading] = useState(false);
  const [scaleError, setScaleError] = useState<string | null>(null);

  const handleRead = async () => {
    setReading(true);
    setScaleError(null);
    try {
      const port = await requestScalePort();
      const result = await readWeight(port, 'METTLER_TOLEDO' as ScaleProtocol);
      onQuantityChange(result.weightGrams / 1000);
      if (!result.stable) setScaleError('Weight unstable — reading may be inaccurate');
    } catch (e: any) {
      setScaleError(e.message);
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => void handleRead()}
        disabled={reading}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-900/30 border border-teal-700/50 text-teal-400 rounded-lg text-xs font-medium hover:bg-teal-900/50 disabled:opacity-50 transition-colors"
      >
        <Scale className="w-3.5 h-3.5" />
        {reading ? 'Reading…' : 'Read Scale'}
      </button>
      {scaleError && <p className="text-xs text-red-400 mt-1">{scaleError}</p>}
    </div>
  );
}
