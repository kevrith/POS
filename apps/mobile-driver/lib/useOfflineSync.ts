import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { flushQueue, subscribeQueue, type QueuedAction } from './offline';

/**
 * Drives the offline queue: flushes on mount, every 30s, and whenever the app
 * returns to the foreground. Invalidates queries after a successful flush so the
 * UI reflects synced status changes. Mount once near the app root.
 */
export function useOfflineSync(): void {
  const qc = useQueryClient();

  useEffect(() => {
    let active = true;

    async function flush() {
      const { synced } = await flushQueue();
      if (active && synced > 0) void qc.invalidateQueries();
    }

    void flush();
    const interval = setInterval(() => void flush(), 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush();
    });

    return () => {
      active = false;
      clearInterval(interval);
      sub.remove();
    };
  }, [qc]);
}

/** Reactive pending-action list for the sync banner. */
export function usePendingActions(): QueuedAction[] {
  const [pending, setPending] = useState<QueuedAction[]>([]);
  useEffect(() => subscribeQueue(setPending), []);
  return pending;
}
