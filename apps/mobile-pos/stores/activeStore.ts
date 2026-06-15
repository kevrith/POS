import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEY = 'pos_active_store';

interface ActiveStoreState {
  /** When set, overrides the user's default store across the whole app. */
  overrideStoreId: string | null;
  setOverride: (storeId: string | null) => void;
}

/**
 * Lets an owner/manager with access to several stores switch which store the
 * app operates on. The choice flows through useActiveStore() so POS, Sales,
 * Reports and Manage all follow the selected store. Persisted so it survives
 * app restarts.
 */
export const useActiveStoreOverride = create<ActiveStoreState>((set) => ({
  overrideStoreId: null,
  setOverride: (storeId) => {
    if (storeId) SecureStore.setItemAsync(KEY, storeId).catch(() => {});
    else SecureStore.deleteItemAsync(KEY).catch(() => {});
    set({ overrideStoreId: storeId });
  },
}));

/** Restore the chosen store on cold start (call alongside restoreSession). */
export async function restoreActiveStore(): Promise<void> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v) useActiveStoreOverride.setState({ overrideStoreId: v });
  } catch {
    /* ignore */
  }
}
