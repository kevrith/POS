import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  businessId: string;
  storeId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  businessId: string;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  businessId: 'biz-001',
  setAuth: (user, token) => {
    SecureStore.setItemAsync('driver_token', token).catch(() => {});
    set({ user, token, businessId: user.businessId ?? 'biz-001' });
  },
  clearAuth: () => {
    SecureStore.deleteItemAsync('driver_token').catch(() => {});
    set({ user: null, token: null });
  },
  isLoggedIn: () => !!get().token,
}));
