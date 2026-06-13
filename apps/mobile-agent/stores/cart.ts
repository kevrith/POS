import { create } from 'zustand';

export interface OrderLine {
  itemId?: string;
  itemName: string;
  itemSku?: string;
  quantity: number;
  unitPriceCents: number;
}

interface CartState {
  customerId: string | null;
  customerName: string | null;
  lines: OrderLine[];
  notes: string;
  isSampleOrder: boolean;
  setCustomer: (id: string, name: string) => void;
  addLine: (line: OrderLine) => void;
  updateQty: (index: number, quantity: number) => void;
  removeLine: (index: number) => void;
  setNotes: (notes: string) => void;
  setSample: (v: boolean) => void;
  subtotalCents: () => number;
  clear: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  customerId: null,
  customerName: null,
  lines: [],
  notes: '',
  isSampleOrder: false,
  setCustomer: (id, name) => set({ customerId: id, customerName: name }),
  addLine: (line) =>
    set((s) => {
      // Merge same item (by id or name) into one line
      const idx = s.lines.findIndex(
        (l) => (line.itemId && l.itemId === line.itemId) || (!line.itemId && l.itemName === line.itemName),
      );
      if (idx >= 0) {
        const lines = [...s.lines];
        lines[idx] = { ...lines[idx], quantity: lines[idx].quantity + line.quantity };
        return { lines };
      }
      return { lines: [...s.lines, line] };
    }),
  updateQty: (index, quantity) =>
    set((s) => {
      const lines = [...s.lines];
      if (quantity <= 0) {
        lines.splice(index, 1);
      } else {
        lines[index] = { ...lines[index], quantity };
      }
      return { lines };
    }),
  removeLine: (index) =>
    set((s) => {
      const lines = [...s.lines];
      lines.splice(index, 1);
      return { lines };
    }),
  setNotes: (notes) => set({ notes }),
  setSample: (isSampleOrder) => set({ isSampleOrder }),
  subtotalCents: () => get().lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0),
  clear: () => set({ customerId: null, customerName: null, lines: [], notes: '', isSampleOrder: false }),
}));
