import { useState } from 'react';
import { ShoppingCart, Trash2, Plus, Minus, X, PauseCircle, PlayCircle, AlertTriangle, Edit2, Scale, UserPlus } from 'lucide-react';
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
  isPaying: boolean;
  payError?: string;
  onPay: () => void;
}

export default function CartPanel({
  cart, priceLevel, showCartMobile, setShowCartMobile,
  heldSalesCount, onHold, onShowHeld, onClear,
  onRemoveItem, onUpdateQuantity, onUpdateDiscount, onOpenPriceOverride,
  fefoAlerts, subtotalCents, vatCents, totCents = 0, taxType = 'VAT', promoDiscountCents, appliedPromotion,
  serviceChargeEnabled, setServiceChargeEnabled, serviceChargeRate, serviceChargeCents,
  tipInput, setTipInput, tipCents, totalCents, fxRates, activeCurrencies,
  isPaying, payError, onPay,
}: Props) {
  return (
    <div className={`${
      showCartMobile ? 'fixed inset-0 z-40' : 'hidden'
    } md:relative md:flex md:w-96 bg-white border-l flex-col`}>
      {/* Cart header */}
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
            onClick={onHold}
            disabled={cart.length === 0}
            title="Hold sale (F5)"
            className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg disabled:opacity-30"
          >
            <PauseCircle className="w-5 h-5" />
          </button>
          {heldSalesCount > 0 && (
            <button
              onClick={onShowHeld}
              title="Held sales (F6)"
              className="relative p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
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

      {/* Cart items */}
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
              <CartItem
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
      <div className="border-t">
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>
              {taxType === 'VAT' && vatCents > 0 ? 'Subtotal (ex-VAT)'
               : taxType === 'TOT' && totCents > 0 ? 'Subtotal (ex-TOT)'
               : 'Subtotal'}
            </span>
            <span>{formatKES(subtotalCents - vatCents - totCents)}</span>
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
              <span>Service ({serviceChargeRate}%)</span>
              <span>{formatKES(serviceChargeCents)}</span>
            </div>
          )}
          {taxType === 'VAT' && vatCents > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>VAT (16%)</span>
              <span>{formatKES(vatCents)}</span>
            </div>
          )}
          {taxType === 'TOT' && totCents > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>TOT (3%)</span>
              <span>{formatKES(totCents)}</span>
            </div>
          )}
          {tipCents > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tip/Gratuity</span>
              <span>{formatKES(tipCents)}</span>
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
              onClick={() => setServiceChargeEnabled(!serviceChargeEnabled)}
              className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-colors ${
                serviceChargeEnabled
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              title="Toggle service charge (F3)"
            >
              Svc {serviceChargeRate}% {serviceChargeEnabled ? '✓' : ''}
            </button>
            <button
              onClick={() => { onHold(); }}
              disabled={cart.length === 0}
              title="Hold current sale and start next customer"
              className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 disabled:opacity-30"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Next
            </button>
          </div>

          {/* Tip input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 whitespace-nowrap">Tip (KES)</span>
            <input
              type="number"
              min="0"
              step="10"
              value={tipInput}
              onChange={(e) => setTipInput(e.target.value)}
              placeholder="0.00"
              className="flex-1 px-2 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-blue-500"
            />
            {[50, 100, 200].map((t) => (
              <button
                key={t}
                onClick={() => setTipInput(String(t))}
                className="px-2 py-1.5 text-xs border rounded-lg hover:bg-gray-50 text-gray-600"
              >
                {t}
              </button>
            ))}
            {tipInput && (
              <button onClick={() => setTipInput('')} className="text-gray-400 hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            onClick={onPay}
            disabled={cart.length === 0 || isPaying}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
          >
            {isPaying
              ? 'Processing…'
              : cart.length > 0
                ? `Pay ${formatKES(totalCents)}  (F1)`
                : 'Pay  (F1)'}
          </button>
          {payError && (
            <p className="mt-2 text-xs text-red-600 text-center">{payError}</p>
          )}
        </div>
      </div>
    </div>
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

function CartItem({ item, onRemove, onQuantityChange, onDiscountChange, onPriceOverride }: CartItemRowProps) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 mr-2">
          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
          <p className="text-xs text-gray-500">
            {`KES ${(item.unitPriceCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`} each
            {item.discountPercent && item.discountPercent > 0 && (
              <span className="ml-1 text-green-600">(-{item.discountPercent}%)</span>
            )}
          </p>
        </div>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onQuantityChange(item.quantity - 1)}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-100"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
          <button
            onClick={() => onQuantityChange(item.quantity + 1)}
            className="w-7 h-7 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-100"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <span className="font-bold text-gray-800">
          {`KES ${(item.totalCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input
          type="number"
          min="0"
          max="100"
          value={item.discountPercent ?? 0}
          onChange={(e) => onDiscountChange(parseFloat(e.target.value) || 0)}
          placeholder="Disc %"
          className="w-20 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">% off</span>
        <button
          onClick={onPriceOverride}
          className="flex items-center gap-1 px-2 py-1 text-xs border border-amber-300 text-amber-700 rounded hover:bg-amber-50"
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

// ─── Scale reading button (isolated to keep CartItem clean) ──────────────────

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
        className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 border border-teal-300 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-100 disabled:opacity-50"
      >
        <Scale className="w-3.5 h-3.5" />
        {reading ? 'Reading…' : 'Read Scale'}
      </button>
      {scaleError && <p className="text-xs text-red-500 mt-1">{scaleError}</p>}
    </div>
  );
}
