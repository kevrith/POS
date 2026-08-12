import { create } from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  unitPriceCents: number;
  originalPriceCents: number; // before any override
  quantity: number;
  discountPercent: number; // per-item discount 0-100
  barcode?: string;
}

export interface FEFOAlert {
  itemId: string;
  itemName: string;
  lotNumber: string;
  daysLeft: number | null;
}

export interface AppliedPromotion {
  id: string;
  name: string;
  discountCents: number;
}

interface CartState {
  items: CartItem[];
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  customerId: string | null;
  customerName: string | null;
  fefoAlerts: FEFOAlert[];
  appliedPromotion: AppliedPromotion | null;
  addItem: (item: Omit<CartItem, 'quantity' | 'discountPercent' | 'originalPriceCents'>) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  updateItemDiscount: (id: string, pct: number) => void;
  overrideItemPrice: (id: string, newPriceCents: number) => void;
  clearCart: () => void;
  setPriceLevel: (level: 'RETAIL' | 'WHOLESALE' | 'VIP') => void;
  setCustomer: (id: string | null, name: string | null) => void;
  setFEFOAlerts: (alerts: FEFOAlert[]) => void;
  setPromotion: (promo: AppliedPromotion | null) => void;
  subtotalCents: () => number; // after per-item discounts
  promoDiscountCents: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  priceLevel: 'RETAIL',
  customerId: null,
  customerName: null,
  fefoAlerts: [],
  appliedPromotion: null,

  addItem: (item) =>
    set((s) => {
      const existing = s.items.find((i) => i.id === item.id);
      if (existing) {
        return {
          items: s.items.map((i) =>
            i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return {
        items: [
          ...s.items,
          { ...item, quantity: 1, discountPercent: 0, originalPriceCents: item.unitPriceCents },
        ],
      };
    }),

  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  updateQty: (id, qty) =>
    set((s) => ({
      items:
        qty <= 0
          ? s.items.filter((i) => i.id !== id)
          : s.items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    })),

  updateItemDiscount: (id, pct) =>
    set((s) => ({
      items: s.items.map((i) => {
        if (i.id !== id) return i;
        const clamped = Math.min(100, Math.max(0, pct));
        const discounted = Math.round(i.originalPriceCents * (1 - clamped / 100));
        return { ...i, discountPercent: clamped, unitPriceCents: discounted };
      }),
    })),

  overrideItemPrice: (id, newPriceCents) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.id === id
          ? { ...i, unitPriceCents: newPriceCents, originalPriceCents: newPriceCents, discountPercent: 0 }
          : i
      ),
    })),

  clearCart: () =>
    set({ items: [], customerId: null, customerName: null, appliedPromotion: null, fefoAlerts: [] }),

  setPriceLevel: (priceLevel) => set({ priceLevel }),

  setCustomer: (customerId, customerName) => set({ customerId, customerName }),

  setFEFOAlerts: (fefoAlerts) => set({ fefoAlerts }),

  setPromotion: (appliedPromotion) => set({ appliedPromotion }),

  subtotalCents: () =>
    get().items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),

  promoDiscountCents: () => get().appliedPromotion?.discountCents ?? 0,
}));
