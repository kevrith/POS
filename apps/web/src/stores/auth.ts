import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { setToken, clearToken, getApiUrl } from '../lib/api';

const API_V1 = getApiUrl();

export type UserRole = 'OWNER' | 'MANAGER' | 'ACCOUNTANT' | 'CASHIER' | 'WAITER' | 'KITCHEN';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  businessId: string;
  storeId?: string;
  assignedStoreIds?: string[]; // populated for MANAGER: stores they are scoped to
  planName?: string;           // display label — may lag behind subscriptionTier
  subscriptionTier?: string;   // FREE | STARTER | GROWTH | PRO | ENTERPRISE — gate on this
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  // Email + password login
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  // OAuth token (returned via URL query param after Google callback redirect)
  loginWithOAuth: (accessToken: string, user: AuthUser) => Promise<void>;
  // PIN login (Cashier / Waiter / Kitchen)
  loginWithPin: (pin: string, businessId: string, storeId?: string, userId?: string) => Promise<void>;
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
        const res = await fetch(`${API_V1}/auth/login`, {
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

        // Email login doesn't include storeId — fetch the first store automatically
        if (!data.user.storeId) {
          try {
            const storesRes = await fetch(`${API_V1}/business/${data.user.businessId}/stores`, {
              headers: { Authorization: `Bearer ${data.accessToken}` },
            });
            if (storesRes.ok) {
              const stores = await storesRes.json() as Array<{ id: string }>;
              if (stores.length > 0) {
                data.user.storeId = stores[0].id;
              }
            }
          } catch {
            // non-fatal — POS will show no items but other pages still work
          }
        }

        set({ user: data.user, isAuthenticated: true });
      },

      loginWithOAuth: async (accessToken, user) => {
        setToken(accessToken);

        // Fetch storeId if not present
        if (!user.storeId) {
          try {
            const storesRes = await fetch(`${API_V1}/business/${user.businessId}/stores`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (storesRes.ok) {
              const stores = await storesRes.json() as Array<{ id: string }>;
              if (stores.length > 0) user.storeId = stores[0].id;
            }
          } catch { /* non-fatal */ }
        }

        set({ user, isAuthenticated: true });
      },

      loginWithPin: async (pin, businessId, storeId, userId) => {
        const res = await fetch(`${API_V1}/auth/login/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, businessId, storeId, userId }),
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
