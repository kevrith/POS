/**
 * Sync Engine — handles offline ↔ online synchronisation
 * - Detects online/offline status
 * - Caches server data to IndexedDB
 * - Processes the sync queue when back online
 */
import { getToken, getApiUrl } from './api';
import {
  db,
  cacheItems,
  cacheCustomers,
  getPendingQueue,
  type CachedItem,
  type CachedCustomer,
  type SyncQueueEntry,
} from './db';
import { useSyncStore } from '../stores/sync';

const API_BASE = getApiUrl();

// ─── Network check ────────────────────────────────────────────────────────────

export function isOnline(): boolean {
  return navigator.onLine;
}

/** Confirm online by pinging the API (navigator.onLine can be wrong) */
async function pingOnline(): Promise<boolean> {
  try {
    // Use the public update-check endpoint — no auth required, lightweight
    const res = await fetch(`${API_BASE}/super-admin/update-check`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 404; // any real HTTP response means we're online
  } catch {
    return false;
  }
}

// ─── Cache refreshers ─────────────────────────────────────────────────────────

export async function refreshItemsCache(businessId: string, storeId: string): Promise<void> {
  if (!isOnline()) return;
  try {
    const token = getToken();
    const res = await fetch(
      `${API_BASE}/items?businessId=${businessId}&storeId=${storeId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return;
    const items = (await res.json()) as Array<Record<string, unknown>>;
    const cached: CachedItem[] = items.map((item) => ({
      id: item.id as string,
      businessId: item.businessId as string,
      storeId: item.storeId as string,
      name: item.name as string,
      category: item.category as string | undefined,
      barcode: item.barcode as string | undefined,
      type: item.type as string,
      retailPriceCents: item.retailPriceCents as number,
      wholesalePriceCents: item.wholesalePriceCents as number | undefined,
      vipPriceCents: item.vipPriceCents as number | undefined,
      costPriceCents: item.costPriceCents as number | undefined,
      vatApplicable: Boolean(item.vatApplicable),
      totApplicable: Boolean(item.totApplicable),
      trackStock: Boolean(item.trackStock),
      currentStock: item.currentStock as number ?? 0,
      syncedAt: Date.now(),
    }));
    await cacheItems(cached);
    await db.meta.put({ key: `items-synced:${businessId}:${storeId}`, value: Date.now() });
  } catch (err) {
    console.warn('[SyncEngine] Failed to refresh items cache:', err);
  }
}

export async function refreshCustomersCache(businessId: string): Promise<void> {
  if (!isOnline()) return;
  try {
    const token = getToken();
    const res = await fetch(
      `${API_BASE}/customers?businessId=${businessId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return;
    const customers = (await res.json()) as Array<Record<string, unknown>>;
    const cached: CachedCustomer[] = customers.map((c) => ({
      id: c.id as string,
      businessId: c.businessId as string,
      name: c.name as string,
      phone: c.phone as string | undefined,
      email: c.email as string | undefined,
      creditLimitCents: c.creditLimitCents as number ?? 0,
      balanceCents: c.balanceCents as number ?? 0,
      loyaltyPoints: c.loyaltyPoints as number ?? 0,
      syncedAt: Date.now(),
    }));
    await cacheCustomers(cached);
    await db.meta.put({ key: `customers-synced:${businessId}`, value: Date.now() });
  } catch (err) {
    console.warn('[SyncEngine] Failed to refresh customers cache:', err);
  }
}

// ─── Queue processor ──────────────────────────────────────────────────────────

let _processing = false;

export async function processSyncQueue(): Promise<void> {
  if (_processing) return;
  if (!(await pingOnline())) return;

  _processing = true;
  const { setProcessing, incrementSynced } = useSyncStore.getState();
  setProcessing(true);

  try {
    const pending = await getPendingQueue();
    if (pending.length === 0) {
      setProcessing(false);
      _processing = false;
      return;
    }

    for (const entry of pending) {
      await processEntry(entry);
      incrementSynced();
    }
  } finally {
    setProcessing(false);
    _processing = false;
    // Update pending count
    const count = await db.syncQueue
      .where('status')
      .anyOf(['PENDING', 'SYNCING'])
      .count();
    useSyncStore.getState().setPendingCount(count);
  }
}

async function processEntry(entry: SyncQueueEntry): Promise<void> {
  await db.syncQueue.update(entry.id!, { status: 'SYNCING', attempts: entry.attempts + 1 });

  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}${entry.endpoint}`, {
      method: entry.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: entry.body,
    });

    if (res.ok) {
      const resultData = res.status !== 204 ? JSON.stringify(await res.json()) : undefined;
      await db.syncQueue.update(entry.id!, {
        status: 'DONE',
        resultData,
        processedAt: Date.now(),
      });
    } else {
      const errBody = await res.text();
      await db.syncQueue.update(entry.id!, {
        status: entry.attempts >= 4 ? 'FAILED' : 'PENDING',
        lastError: errBody,
      });
    }
  } catch (err) {
    await db.syncQueue.update(entry.id!, {
      status: entry.attempts >= 4 ? 'FAILED' : 'PENDING',
      lastError: String(err),
    });
  }
}

// ─── Auto-sync on reconnect ───────────────────────────────────────────────────

let _syncInterval: ReturnType<typeof setInterval> | null = null;

export function initSyncEngine(): void {
  const { setOnline, setPendingCount } = useSyncStore.getState();

  // Initial state
  setOnline(isOnline());

  // Listen for browser online/offline events
  window.addEventListener('online', () => {
    setOnline(true);
    void processSyncQueue();
  });

  window.addEventListener('offline', () => {
    setOnline(false);
  });

  // Periodic sync every 30 seconds when online
  _syncInterval = setInterval(async () => {
    if (isOnline()) {
      await processSyncQueue();
      const count = await db.syncQueue
        .where('status')
        .anyOf(['PENDING', 'SYNCING'])
        .count();
      setPendingCount(count);
    } else {
      setOnline(false);
    }
  }, 30_000);

  // Initial pending count
  void db.syncQueue
    .where('status')
    .anyOf(['PENDING', 'SYNCING'])
    .count()
    .then(setPendingCount);
}

export function destroySyncEngine(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval);
    _syncInterval = null;
  }
}
