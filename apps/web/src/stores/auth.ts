import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setToken, clearToken } from '../lib/api';

export type UserRole = 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'CASHIER' | 'WAITER' | 'KITCHEN';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  businessId: string;
  storeId?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  // Email + password login
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  // PIN login (Cashier / Waiter / Kitchen)
  loginWithPin: (pin: string, businessId: string, storeId?: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: (() => {
        // Restore isAuthenticated from sessionStorage token on initial load
        const token = sessionStorage.getItem('pos-access-token');
        return !!token;
      })(),

      login: async (email, password, totpCode) => {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, totpCode }),
        });

        if (!res.ok) {
          const body = await res.json() as { message?: string };
          throw new Error(body.message ?? 'Login failed');
        }

        const data = await res.json() as { accessToken: string; user: AuthUser };
        setToken(data.accessToken);
        set({ user: data.user, isAuthenticated: true });
      },

      loginWithPin: async (pin, businessId, storeId) => {
        const res = await fetch('/api/auth/login/pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, businessId, storeId }),
        });

        if (!res.ok) {
          const body = await res.json() as { message?: string };
          throw new Error(body.message ?? 'Invalid PIN');
        }

        const data = await res.json() as { accessToken: string; user: AuthUser };
        setToken(data.accessToken);
        set({ user: data.user, isAuthenticated: true });
      },

      logout: () => {
        clearToken();
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: 'pos-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user object; token is handled separately by api.ts
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
