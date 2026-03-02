import { create } from 'zustand';

export interface CartItem {
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  barcode?: string;
}

interface CartState {
  items: CartItem[];
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  customerId: string | null;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (id: string) => void;
  updateQty: (id: string, qty: number) => void;
  clearCart: () => void;
  setPriceLevel: (level: 'RETAIL' | 'WHOLESALE' | 'VIP') => void;
  setCustomer: (id: string | null) => void;
  subtotalCents: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  priceLevel: 'RETAIL',
  customerId: null,
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
      return { items: [...s.items, { ...item, quantity: 1 }] };
    }),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  updateQty: (id, qty) =>
    set((s) => ({
      items:
        qty <= 0
          ? s.items.filter((i) => i.id !== id)
          : s.items.map((i) => (i.id === id ? { ...i, quantity: qty } : i)),
    })),
  clearCart: () => set({ items: [], customerId: null }),
  setPriceLevel: (priceLevel) => set({ priceLevel }),
  setCustomer: (customerId) => set({ customerId }),
  subtotalCents: () =>
    get().items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
}));
