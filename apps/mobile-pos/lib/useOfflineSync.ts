import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeSalesQueue, type QueueStatus } from './db';
import { processSyncQueue } from './sync';

const EMPTY: QueueStatus = { pending: 0, rejected: [] };

/**
 * Uploads sales made offline without anyone having to remember: on launch, every 30 seconds, and whenever the
 * app returns to the foreground, while someone is signed in. Mount once near the app root. Refreshes cached data after sales went through.
 */
export function useOfflineSync(enabled = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;

    async function flush() {
      const { synced } = await processSyncQueue();
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
  }, [qc, enabled]);
}

/** Reactive queue status for the sync banner and Settings. */
export function useSalesQueueStatus(): QueueStatus {
  const [status, setStatus] = useState<QueueStatus>(EMPTY);
  useEffect(() => subscribeSalesQueue(setStatus), []);
  return status;
}
