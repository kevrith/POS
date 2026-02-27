/**
 * Zustand store for sync engine state — online status, pending count, etc.
 */
import { create } from 'zustand';

interface SyncState {
  isOnline: boolean;
  isProcessing: boolean;
  pendingCount: number;
  syncedCount: number; // total synced this session
  setOnline: (v: boolean) => void;
  setProcessing: (v: boolean) => void;
  setPendingCount: (v: number) => void;
  incrementSynced: () => void;
}

export const useSyncStore = create<SyncState>()((set) => ({
  isOnline: navigator.onLine,
  isProcessing: false,
  pendingCount: 0,
  syncedCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  incrementSynced: () => set((s) => ({ syncedCount: s.syncedCount + 1 })),
}));
