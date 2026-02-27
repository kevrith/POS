/**
 * Dexie (IndexedDB) database — offline-first local store
 * Mirrors the server data for offline POS operation.
 */
import Dexie, { type Table } from 'dexie';

// ─── Cached item (from server) ────────────────────────────────────────────────
export interface CachedItem {
  id: string;
  businessId: string;
  storeId: string;
  name: string;
  category?: string;
  barcode?: string;
  type: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  vatApplicable: boolean;
  totApplicable: boolean;
  trackStock: boolean;
  currentStock: number;
  syncedAt: number; // timestamp
}

// ─── Cached customer ──────────────────────────────────────────────────────────
export interface CachedCustomer {
  id: string;
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
  creditLimitCents: number;
  balanceCents: number;
  loyaltyPoints: number;
  syncedAt: number;
}

// ─── Sync queue entry ─────────────────────────────────────────────────────────
export type SyncPriority = 'HIGH' | 'NORMAL';
export type SyncStatus = 'PENDING' | 'SYNCING' | 'DONE' | 'FAILED';

export interface SyncQueueEntry {
  id?: number;             // auto-increment PK
  offlineId: string;       // UUID — idempotency key
  priority: SyncPriority;  // HIGH = eTIMS, voids; NORMAL = everything else
  endpoint: string;        // e.g. '/sales/checkout'
  method: 'POST' | 'PATCH' | 'DELETE';
  body: string;            // JSON-encoded request body
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  resultData?: string;     // JSON-encoded response when DONE
  createdAt: number;       // Date.now()
  processedAt?: number;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────
export interface MetaEntry {
  key: string;
  value: string | number;
}

// ─── Dexie database ───────────────────────────────────────────────────────────
class POSDatabase extends Dexie {
  items!: Table<CachedItem>;
  customers!: Table<CachedCustomer>;
  syncQueue!: Table<SyncQueueEntry>;
  meta!: Table<MetaEntry>;

  constructor() {
    super('POSKenyaDB');

    this.version(1).stores({
      items: 'id, businessId, storeId, [businessId+storeId], barcode, category',
      customers: 'id, businessId, phone',
      syncQueue: '++id, offlineId, priority, status, createdAt',
      meta: 'key',
    });
  }
}

export const db = new POSDatabase();

// ─── Convenience helpers ──────────────────────────────────────────────────────

/** Get all items for a store from IndexedDB cache */
export async function getCachedItems(businessId: string, storeId: string): Promise<CachedItem[]> {
  return db.items.where('[businessId+storeId]').equals([businessId, storeId]).toArray();
}

/** Upsert items into IndexedDB cache */
export async function cacheItems(items: CachedItem[]): Promise<void> {
  await db.items.bulkPut(items);
}

/** Get all customers for a business from IndexedDB cache */
export async function getCachedCustomers(businessId: string): Promise<CachedCustomer[]> {
  return db.customers.where('businessId').equals(businessId).toArray();
}

/** Upsert customers into IndexedDB cache */
export async function cacheCustomers(customers: CachedCustomer[]): Promise<void> {
  await db.customers.bulkPut(customers);
}

/** Add an operation to the sync queue */
export async function enqueue(entry: Omit<SyncQueueEntry, 'id' | 'attempts' | 'status' | 'createdAt'>): Promise<void> {
  await db.syncQueue.add({
    ...entry,
    attempts: 0,
    status: 'PENDING',
    createdAt: Date.now(),
  });
}

/** Get all pending sync queue entries, HIGH priority first */
export async function getPendingQueue(): Promise<SyncQueueEntry[]> {
  const all = await db.syncQueue
    .where('status')
    .anyOf(['PENDING', 'FAILED'])
    .and((e) => e.attempts < 5)
    .toArray();

  return all.sort((a, b) => {
    if (a.priority === 'HIGH' && b.priority !== 'HIGH') return -1;
    if (b.priority === 'HIGH' && a.priority !== 'HIGH') return 1;
    return a.createdAt - b.createdAt;
  });
}

/** Get count of pending items */
export async function getPendingCount(): Promise<number> {
  return db.syncQueue
    .where('status')
    .anyOf(['PENDING', 'SYNCING'])
    .count();
}
