import { create } from 'zustand';
import { taxClassOf, type TaxClass } from '@pos/shared';

export type PriceLevel = 'RETAIL' | 'WHOLESALE' | 'VIP';
export type ItemType = 'PRODUCT' | 'SERVICE' | 'WEIGHTED' | 'BUNDLE' | 'RECIPE';

export interface ItemUOM {
  id: string;
  unitName: string;
  unitAbbrev: string;
  conversionFactor: number;
  isBaseUnit: boolean;
  priceCents?: number | null;
  barcode?: string | null;
}

export interface CartItem {
  id: string;
  name: string;
  barcode?: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent?: number;
  totalCents: number;
  trackStock: boolean;
  currentStock?: number;
  itemType: ItemType;
  vatApplicable: boolean;
  /** KRA tax class the line is sold under (A exempt, B 16%, C zero-rated, D not VAT). */
  taxClass: TaxClass;
  totApplicable: boolean;
  weightGrams?: number;
  tareGrams?: number;
  // UOM packaging support
  selectedUOM?: ItemUOM | null;       // which packaging was selected at POS
  stockDeductionPerUnit?: number;     // base units to deduct per cart qty (= conversionFactor)
  /** Medicines: needs a prescription / controlled schedule. The till asks a manager before selling these. */
  requiresPrescription?: boolean;
  scheduleClass?: string | null;
}

export interface ApiItem {
  id: string;
  name: string;
  barcode?: string;
  type: ItemType;
  retailPriceCents: number;
  wholesalePriceCents?: number | null;
  vipPriceCents?: number | null;
  costPriceCents?: number | null;
  trackStock: boolean;
  currentStock?: number;
  trackExpiry?: boolean;
  defaultExpiryDays?: number | null;
  vatApplicable: boolean;
  taxClass?: TaxClass | null;
  totApplicable: boolean;
  category?: { id: string; name: string; color?: string } | string | null;
  ageRestricted?: boolean;
  minAgeYears?: number;
  tareWeightGrams?: number;
  binLocation?: string;
  sku?: string;
  soldOut?: boolean;
  negativeStockPolicy?: string | null;
  uoms?: ItemUOM[];
  requiresPrescription?: boolean;
  scheduleClass?: string | null;
}

export interface HeldSale {
  id: string;
  label: string;
  cart: CartItem[];
  priceLevel: PriceLevel;
  customerId?: string;
  customerName?: string;
  createdAt: string;
}

interface POSState {
  cart: CartItem[];
  priceLevel: PriceLevel;
  customerId: string | null;
  customerName: string | null;
  heldSales: HeldSale[];
  addToCart: (item: ApiItem, uom?: ItemUOM) => void;
  addWeightedToCart: (item: ApiItem, weightGrams: number, overridePriceCents?: number) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateDiscount: (id: string, discountPercent: number) => void;
  updateUnitPrice: (id: string, newPriceCents: number) => void;
  updateTare: (id: string, tareGrams: number) => void;
  clearCart: () => void;
  setPriceLevel: (level: PriceLevel) => void;
  setCustomer: (id: string | null, name: string | null) => void;
  holdCurrentSale: (label?: string) => void;
  resumeHeldSale: (id: string) => void;
  discardHeldSale: (id: string) => void;
}

function getPriceForLevel(item: ApiItem, level: PriceLevel): number {
  if (level === 'WHOLESALE' && item.wholesalePriceCents) return item.wholesalePriceCents;
  if (level === 'VIP' && item.vipPriceCents) return item.vipPriceCents;
  return item.retailPriceCents;
}

export const usePOSStore = create<POSState>()((set, _get) => ({
  cart: [],
  priceLevel: 'RETAIL',
  customerId: null,
  customerName: null,
  heldSales: [],

  addToCart: (item: ApiItem, uom?: ItemUOM) =>
    set((state) => {
      const basePrice = getPriceForLevel(item, state.priceLevel);
      // If a UOM is selected, use its price (if set) or calculate from base price × conversion
      const unitPrice = uom
        ? (uom.priceCents ?? Math.round(basePrice * uom.conversionFactor))
        : basePrice;
      const deduction = uom?.conversionFactor ?? 1;
      const cartKey = uom ? `${item.id}::${uom.id}` : item.id;

      const existing = state.cart.find((i) => i.id === cartKey);
      if (existing) {
        return {
          cart: state.cart.map((i) =>
            i.id === cartKey
              ? { ...i, quantity: i.quantity + 1, totalCents: (i.quantity + 1) * i.unitPriceCents }
              : i,
          ),
        };
      }
      const newItem: CartItem = {
        id: cartKey,
        name: uom && !uom.isBaseUnit ? `${item.name} (${uom.unitName})` : item.name,
        barcode: uom?.barcode ?? item.barcode,
        quantity: 1,
        unitPriceCents: unitPrice,
        totalCents: unitPrice,
        trackStock: item.trackStock,
        currentStock: item.currentStock,
        itemType: item.type,
        vatApplicable: item.vatApplicable,
        taxClass: taxClassOf(item),
        totApplicable: item.totApplicable,
        selectedUOM: uom ?? null,
        stockDeductionPerUnit: deduction,
        requiresPrescription: item.requiresPrescription,
        scheduleClass: item.scheduleClass,
      };
      return { cart: [...state.cart, newItem] };
    }),

  addWeightedToCart: (item: ApiItem, weightGrams: number, overridePriceCents?: number) =>
    set((state) => {
      const unitPrice = overridePriceCents ?? getPriceForLevel(item, state.priceLevel);
      // quantity = kg, price per kg → totalCents = (weightGrams/1000) * unitPrice
      const quantity = weightGrams / 1000;
      const totalCents = Math.round(quantity * unitPrice);
      const newItem: CartItem = {
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        quantity,
        unitPriceCents: unitPrice,
        totalCents,
        trackStock: item.trackStock,
        currentStock: item.currentStock,
        itemType: item.type,
        vatApplicable: item.vatApplicable,
        taxClass: taxClassOf(item),
        totApplicable: item.totApplicable,
        weightGrams,
        requiresPrescription: item.requiresPrescription,
        scheduleClass: item.scheduleClass,
      };
      // Always add as new line (weight items are unique per scan)
      return { cart: [...state.cart, newItem] };
    }),

  removeFromCart: (id) =>
    set((state) => ({ cart: state.cart.filter((i) => i.id !== id) })),

  updateQuantity: (id, quantity) =>
    set((state) => ({
      cart:
        quantity <= 0
          ? state.cart.filter((i) => i.id !== id)
          : state.cart.map((i) => {
              if (i.id === id) {
                const discount = i.discountPercent ?? 0;
                const discountedPrice = Math.round(i.unitPriceCents * (1 - discount / 100));
                return { ...i, quantity, totalCents: quantity * discountedPrice };
              }
              return i;
            }),
    })),

  updateDiscount: (id, discountPercent) =>
    set((state) => ({
      cart: state.cart.map((i) => {
        if (i.id === id) {
          const discount = Math.max(0, Math.min(100, discountPercent));
          const discountedPrice = Math.round(i.unitPriceCents * (1 - discount / 100));
          return { ...i, discountPercent: discount, totalCents: i.quantity * discountedPrice };
        }
        return i;
      }),
    })),

  updateUnitPrice: (id, newPriceCents) =>
    set((state) => ({
      cart: state.cart.map((i) => {
        if (i.id === id) {
          const discount = i.discountPercent ?? 0;
          const discountedPrice = Math.round(newPriceCents * (1 - discount / 100));
          return { ...i, unitPriceCents: newPriceCents, totalCents: i.quantity * discountedPrice };
        }
        return i;
      }),
    })),

  updateTare: (id, tareGrams) =>
    set((state) => ({
      cart: state.cart.map((i) => {
        if (i.id === id && i.weightGrams != null) {
          const netGrams = Math.max(0, i.weightGrams - tareGrams);
          const netQty = netGrams / 1000;
          const discount = i.discountPercent ?? 0;
          const discountedPrice = Math.round(i.unitPriceCents * (1 - discount / 100));
          return { ...i, tareGrams, quantity: netQty, totalCents: Math.round(netQty * discountedPrice) };
        }
        return i;
      }),
    })),

  clearCart: () => set({ cart: [], customerId: null, customerName: null }),

  setPriceLevel: (level) => set({ priceLevel: level }),

  setCustomer: (id, name) => set({ customerId: id, customerName: name }),

  holdCurrentSale: (label) =>
    set((state) => {
      if (state.cart.length === 0) return state;
      if (state.heldSales.length >= 10) return state; // max 10 held sales
      const held: HeldSale = {
        id: crypto.randomUUID(),
        label: label ?? `Held ${new Date().toLocaleTimeString('en-KE')}`,
        cart: [...state.cart],
        priceLevel: state.priceLevel,
        customerId: state.customerId ?? undefined,
        customerName: state.customerName ?? undefined,
        createdAt: new Date().toISOString(),
      };
      return {
        heldSales: [...state.heldSales, held],
        cart: [],
        customerId: null,
        customerName: null,
      };
    }),

  resumeHeldSale: (id) =>
    set((state) => {
      const held = state.heldSales.find((s) => s.id === id);
      if (!held) return state;
      return {
        cart: held.cart,
        priceLevel: held.priceLevel,
        customerId: held.customerId ?? null,
        customerName: held.customerName ?? null,
        heldSales: state.heldSales.filter((s) => s.id !== id),
      };
    }),

  discardHeldSale: (id) =>
    set((state) => ({ heldSales: state.heldSales.filter((s) => s.id !== id) })),
}));
