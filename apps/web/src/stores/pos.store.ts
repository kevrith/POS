import { create } from 'zustand';

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface POSStore {
  cart: CartItem[];
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  addItem: (item: Omit<CartItem, 'totalCents'>) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  setPriceLevel: (level: 'RETAIL' | 'WHOLESALE' | 'VIP') => void;
  clearCart: () => void;
  getSubtotal: () => number;
}

export const usePOSStore = create<POSStore>((set, get) => ({
  cart: [],
  priceLevel: 'RETAIL',

  addItem: (item) => {
    const cart = get().cart;
    const existing = cart.find(i => i.itemId === item.itemId);

    if (existing) {
      set({
        cart: cart.map(i =>
          i.itemId === item.itemId
            ? { ...i, quantity: i.quantity + item.quantity, totalCents: i.unitPriceCents * (i.quantity + item.quantity) }
            : i
        ),
      });
    } else {
      set({ cart: [...cart, { ...item, totalCents: item.unitPriceCents * item.quantity }] });
    }
  },

  removeItem: (itemId) => set({ cart: get().cart.filter(i => i.itemId !== itemId) }),

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    set({
      cart: get().cart.map(i =>
        i.itemId === itemId ? { ...i, quantity, totalCents: i.unitPriceCents * quantity } : i
      ),
    });
  },

  setPriceLevel: (level) => set({ priceLevel: level }),

  clearCart: () => set({ cart: [] }),

  getSubtotal: () => get().cart.reduce((sum, item) => sum + item.totalCents, 0),
}));
