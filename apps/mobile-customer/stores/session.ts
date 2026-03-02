import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SessionState {
  businessId: string;
  storeId: string | null;
  customerName: string | null;
  phone: string | null;
  // Setters
  setBusinessId: (id: string) => void;
  setStoreId: (id: string | null) => void;
  setCustomerName: (name: string) => void;
  setPhone: (phone: string) => void;
  // Persist to AsyncStorage
  persist: () => Promise<void>;
  restore: () => Promise<void>;
}

const STORAGE_KEY = 'customer_session';

export const useSessionStore = create<SessionState>((set, get) => ({
  businessId: 'biz-001',
  storeId: null,
  customerName: null,
  phone: null,

  setBusinessId: (businessId) => set({ businessId }),
  setStoreId: (storeId) => set({ storeId }),
  setCustomerName: (customerName) => set({ customerName }),
  setPhone: (phone) => set({ phone }),

  persist: async () => {
    const { businessId, storeId, customerName, phone } = get();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ businessId, storeId, customerName, phone }));
  },

  restore: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
    if (raw) {
      const parsed = JSON.parse(raw);
      set({
        businessId: parsed.businessId ?? 'biz-001',
        storeId: parsed.storeId ?? null,
        customerName: parsed.customerName ?? null,
        phone: parsed.phone ?? null,
      });
    }
  },
}));
