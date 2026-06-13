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
    // Persist the user too — businessId/storeId are needed after app restarts
    SecureStore.setItemAsync('pos_user', JSON.stringify(user)).catch(() => {});
    set({ user, token });
  },
  setTokenFromStorage: (token) => {
    set({ token });
  },
  clearAuth: () => {
    SecureStore.deleteItemAsync('pos_token').catch(() => {});
    SecureStore.deleteItemAsync('pos_user').catch(() => {});
    set({ user: null, token: null });
  },
  isLoggedIn: () => !!get().token,
}));

/** Restore token + user from SecureStore (app cold start). */
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync('pos_token'),
      SecureStore.getItemAsync('pos_user'),
    ]);
    if (!token) return false;
    const user = userJson ? (JSON.parse(userJson) as User) : null;
    useAuthStore.setState({ token, user });
    return true;
  } catch {
    return false;
  }
}
