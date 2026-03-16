import type { RefObject } from 'react';
import { Search, ShoppingCart, Camera, Monitor, User, Star, X } from 'lucide-react';
import type { ApiItem, PriceLevel } from '../../stores/pos';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAT_COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#F97316','#EC4899','#6366F1','#14B8A6'];

function categoryColor(name?: string | null): string {
  if (!name) return '#3B82F6';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CAT_COLORS[Math.abs(h) % CAT_COLORS.length];
}

function formatKES(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PRICE_LEVEL_LABELS: Record<PriceLevel, string> = {
  RETAIL: 'Retail',
  WHOLESALE: 'Wholesale',
  VIP: 'VIP',
};

interface Category {
  id: string;
  name: string;
  color?: string;
}

interface LoyaltyData {
  loyaltyPoints: number;
  program?: { redemptionRate: number; minRedemption: number };
}

interface Props {
  items: ApiItem[];
  categories: Category[];
  activeCategory: string;
  setActiveCategory: (id: string) => void;
  priceLevel: PriceLevel;
  setPriceLevel: (level: PriceLevel) => void;
  search: string;
  setSearch: (v: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  ageConfirmed: boolean;
  heldSalesCount: number;
  customerName: string | null;
  loyaltyData: LoyaltyData | null | undefined;
  loyaltyDiscountApplied: boolean;
  loyaltyDiscountCents: number;
  onAddItem: (item: ApiItem) => void;
  onBarcodeSearch: (raw: string) => void;
  onOpenCamera: () => void;
  enableBarcodeScanner?: boolean;
  onSelectCustomer: () => void;
  onClearCustomer: () => void;
  onToggleLoyalty: () => void;
  onAgeRestrictedItem: (item: ApiItem) => void;
}

export default function ItemGrid({
  items, categories, activeCategory, setActiveCategory,
  priceLevel, setPriceLevel, search, setSearch, searchRef,
  ageConfirmed, heldSalesCount, customerName, loyaltyData,
  loyaltyDiscountApplied, loyaltyDiscountCents,
  onAddItem, onBarcodeSearch, onOpenCamera, enableBarcodeScanner = true, onSelectCustomer,
  onClearCustomer, onToggleLoyalty, onAgeRestrictedItem,
}: Props) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search + Price Level bar */}
      <div className="bg-white border-b px-3 md:px-4 py-2 md:py-3 flex flex-col xs:flex-row items-stretch xs:items-center gap-2 md:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && search) onBarcodeSearch(search); }}
            placeholder="Search or scan barcode"
            className="w-full pl-9 pr-10 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {enableBarcodeScanner && (
            <button
              onClick={onOpenCamera}
              title="Scan barcode with camera"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-blue-600 rounded"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap xs:flex-nowrap">
          {/* Price Level pill buttons */}
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

          {/* Customer chip / select button */}
          {customerName ? (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-blue-50 rounded-lg text-sm min-w-0">
                <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-700 font-medium truncate max-w-[80px] xs:max-w-[120px]">{customerName}</span>
                <button onClick={onClearCustomer} className="text-blue-400 hover:text-blue-700 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {loyaltyData && loyaltyData.loyaltyPoints > 0 && loyaltyData.program && (
                <button
                  onClick={onToggleLoyalty}
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
              onClick={onSelectCustomer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex-shrink-0"
              title="Select customer (F2)"
            >
              <User className="w-4 h-4" />
              <span className="hidden xs:inline">Customer</span>
            </button>
          )}

          {/* Pole Display */}
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
            activeCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          All Items
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Item grid */}
      <div className={`flex-1 overflow-y-auto p-3 md:p-4 pb-20 md:pb-4`}>
        <div className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-3">
          {items.map((item) => {
            const price =
              priceLevel === 'WHOLESALE' && item.wholesalePriceCents
                ? item.wholesalePriceCents
                : priceLevel === 'VIP' && item.vipPriceCents
                  ? item.vipPriceCents
                  : item.retailPriceCents;
            const outOfStock = item.trackStock && (item.currentStock ?? 0) <= 0;
            const isExpiringSoon = !!(item.trackExpiry && item.defaultExpiryDays != null && item.defaultExpiryDays <= 30);
            const isExpired = !!(item.trackExpiry && item.defaultExpiryDays != null && item.defaultExpiryDays <= 0);

            const handleClick = () => {
              if (outOfStock || isExpired) return;
              if (item.ageRestricted && !ageConfirmed) {
                onAgeRestrictedItem(item);
                return;
              }
              onAddItem(item);
            };

            return (
              <button
                key={item.id}
                onClick={handleClick}
                disabled={outOfStock || isExpired}
                className={`p-3 rounded-xl border-2 text-left transition-all relative ${
                  outOfStock || isExpired
                    ? 'opacity-40 cursor-not-allowed border-gray-100 bg-gray-50'
                    : 'border-gray-200 bg-white hover:border-blue-400 hover:shadow-md active:scale-95'
                }`}
              >
                {item.ageRestricted && (
                  <div className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-bold px-1 py-0.5 rounded">
                    {item.minAgeYears ?? 18}+
                  </div>
                )}
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
        {items.length === 0 && (
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
        <span><kbd className="bg-gray-200 px-1 rounded">F6</kbd> Held ({heldSalesCount})</span>
        <span><kbd className="bg-gray-200 px-1 rounded">F7</kbd> Proforma</span>
        <span><kbd className="bg-gray-200 px-1 rounded">F8</kbd> Layaway</span>
      </div>
    </div>
  );
}
