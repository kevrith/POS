import { create } from 'zustand';
import type { CartItem, AppliedPromotion } from './cart';

export interface HeldSale {
  id: string;
  label: string;
  createdAt: string;
  items: CartItem[];
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  customerId: string | null;
  customerName: string | null;
  appliedPromotion: AppliedPromotion | null;
}

interface HeldSalesState {
  held: HeldSale[];
  hold: (sale: Omit<HeldSale, 'id' | 'createdAt' | 'label'>) => void;
  resume: (id: string) => HeldSale | null;
  discard: (id: string) => void;
}

const MAX_HELD = 10;

export const useHeldSalesStore = create<HeldSalesState>((set, get) => ({
  held: [],

  hold: (sale) => {
    const { held } = get();
    if (held.length >= MAX_HELD) return;
    const id = Math.random().toString(36).slice(2);
    const label = sale.customerName
      ? `${sale.customerName}'s order`
      : `Order ${held.length + 1}`;
    set({
      held: [
        ...held,
        { ...sale, id, label, createdAt: new Date().toISOString() },
      ],
    });
  },

  resume: (id) => {
    const { held } = get();
    const sale = held.find((h) => h.id === id) ?? null;
    if (sale) set({ held: held.filter((h) => h.id !== id) });
    return sale;
  },

  discard: (id) =>
    set((s) => ({ held: s.held.filter((h) => h.id !== id) })),
}));
