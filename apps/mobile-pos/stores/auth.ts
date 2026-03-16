import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

interface User {
  id: string;
  name: string;
  email: string | null;
  role: string;
  businessId: string;
  storeId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  setTokenFromStorage: (token: string) => void;
  clearAuth: () => void;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    SecureStore.setItemAsync('pos_token', token).catch(() => {});
    set({ user, token });
  },
  setTokenFromStorage: (token) => {
    set({ token });
  },
  clearAuth: () => {
    SecureStore.deleteItemAsync('pos_token').catch(() => {});
    set({ user: null, token: null });
  },
  isLoggedIn: () => !!get().token,
}));
