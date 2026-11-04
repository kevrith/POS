import { getPendingSales, markSaleSynced, recordSaleFailure } from './db';
import { ApiError, mobileApi } from './api';

export interface SyncResult {
  synced: number;
  /** Sales the server refused. They stay in the queue, visible, until a person deals with them. */
  rejected: number;
  /** Sales that could not be tried or did not get through (offline, server down); retried automatically. */
  failed: number;
}

type Verdict = 'rejected' | 'retry' | 'auth';

/**
 * What a failed upload means. A 4xx says the SERVER refused this sale (out of stock, invalid item): sending
 * the same request again can never work, so it is parked for a person. A lost connection, a 5xx, a timeout
 * or rate limit are temporary. A 401 is an expired login: not the sale's fault, so it is not counted at all.
 */
export function classifyFailure(err: unknown): Verdict {
  const status = err instanceof ApiError ? err.status : undefined;
  if (status === 401) return 'auth';
  if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) return 'rejected';
  return 'retry';
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Upload queued sales, oldest first. Safe to call from anywhere at any time: while one run is going, every
 * caller shares it (a timer, the foreground trigger and the Sync button never upload the same sale twice).
 * The server also ignores a repeated offlineId, so even a crash between upload and bookkeeping cannot duplicate.
 */
export function processSyncQueue(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = run().finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function run(): Promise<SyncResult> {
  const pending = await getPendingSales();
  const result: SyncResult = { synced: 0, rejected: 0, failed: 0 };

  for (const sale of pending) {
    try {
      await mobileApi.post('/sales/checkout', { ...sale.payload, offlineId: sale.offlineId });
      await markSaleSynced(sale.offlineId);
      result.synced++;
    } catch (err) {
      const verdict = classifyFailure(err);
      const message = err instanceof Error ? err.message : 'Upload failed';
      if (verdict === 'auth') {
        result.failed += pending.length - result.synced - result.rejected;
        break;
      }
      if (verdict === 'rejected') {
        await recordSaleFailure(sale.offlineId, message, true);
        result.rejected++;
        continue; // one refused sale must not hold up the ones behind it
      }
      await recordSaleFailure(sale.offlineId, message, false);
      result.failed += pending.length - result.synced - result.rejected;
      break; // offline or server down: stop, keep order, try again later instead of hammering
    }
  }
  return result;
}
