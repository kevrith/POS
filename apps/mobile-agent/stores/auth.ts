import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export interface AgentUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  businessId: string;
  storeId?: string;
}

interface AuthState {
  user: AgentUser | null;
  token: string | null;
  setAuth: (user: AgentUser, token: string) => void;
  clearAuth: () => void;
  isLoggedIn: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    SecureStore.setItemAsync('agent_token', token).catch(() => {});
    SecureStore.setItemAsync('agent_user', JSON.stringify(user)).catch(() => {});
    set({ user, token });
  },
  clearAuth: () => {
    SecureStore.deleteItemAsync('agent_token').catch(() => {});
    SecureStore.deleteItemAsync('agent_user').catch(() => {});
    set({ user: null, token: null });
  },
  isLoggedIn: () => !!get().token,
}));

/** Restore token + user from SecureStore on app cold start. */
export async function restoreSession(): Promise<boolean> {
  try {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync('agent_token'),
      SecureStore.getItemAsync('agent_user'),
    ]);
    if (!token) return false;
    const user = userJson ? (JSON.parse(userJson) as AgentUser) : null;
    useAuthStore.setState({ token, user });
    return true;
  } catch {
    return false;
  }
}
