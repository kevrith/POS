import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SessionState {
  businessId: string;
  businessName: string;
  storeId: string | null;
  customerName: string | null;
  phone: string | null;
  // Auth (phone-OTP customer portal session)
  token: string | null;
  customerId: string | null;
  // Setters
  setBusinessId: (id: string) => void;
  setBusinessName: (name: string) => void;
  setStoreId: (id: string | null) => void;
  setCustomerName: (name: string) => void;
  setPhone: (phone: string) => void;
  // Auth actions
  setAuth: (a: { token: string; customerId: string; customerName: string; phone: string }) => Promise<void>;
  logout: () => Promise<void>;
  // Persist to AsyncStorage
  persist: () => Promise<void>;
  restore: () => Promise<void>;
  reset: () => void;
}

const STORAGE_KEY = 'customer_session';
const TOKEN_KEY = 'customer_token'; // also read by lib/api.ts for the Authorization header

export const useSessionStore = create<SessionState>((set, get) => ({
  businessId: '',
  businessName: '',
  storeId: null,
  customerName: null,
  phone: null,
  token: null,
  customerId: null,

  setBusinessId: (businessId) => set({ businessId }),
  setBusinessName: (businessName) => set({ businessName }),
  setStoreId: (storeId) => set({ storeId }),
  setCustomerName: (customerName) => set({ customerName }),
  setPhone: (phone) => set({ phone }),

  setAuth: async ({ token, customerId, customerName, phone }) => {
    set({ token, customerId, customerName, phone });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await get().persist();
  },

  logout: async () => {
    set({ token: null, customerId: null });
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    await get().persist();
  },

  persist: async () => {
    const { businessId, businessName, storeId, customerName, phone, customerId } = get();
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ businessId, businessName, storeId, customerName, phone, customerId }),
    );
  },

  restore: async () => {
    const [raw, token] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY).catch(() => null),
      AsyncStorage.getItem(TOKEN_KEY).catch(() => null),
    ]);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string | null>;
      set({
        businessId:   parsed['businessId']   ?? '',
        businessName: parsed['businessName'] ?? '',
        storeId:      parsed['storeId']      ?? null,
        customerName: parsed['customerName'] ?? null,
        phone:        parsed['phone']        ?? null,
        customerId:   parsed['customerId']   ?? null,
      });
    }
    set({ token: token ?? null });
  },

  reset: () => {
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    set({ businessId: '', businessName: '', storeId: null, customerName: null, phone: null, token: null, customerId: null });
  },
}));
