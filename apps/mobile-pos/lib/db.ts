/**
 * Offline storage using AsyncStorage (since expo-sqlite is not installed).
 * Queues failed sales for retry and caches items locally.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SALES_QUEUE_KEY = 'kastra:sales_queue';
const ITEMS_CACHE_KEY = 'kastra:items_cache';

interface QueuedSale {
  id: number;
  offlineId: string;
  payload: object;
  createdAt: string;
  synced: boolean;
}

// ─── Sales Queue ─────────────────────────────────────────────────────────────

async function getSalesQueue(): Promise<QueuedSale[]> {
  try {
    const raw = await AsyncStorage.getItem(SALES_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveSalesQueue(queue: QueuedSale[]): Promise<void> {
  await AsyncStorage.setItem(SALES_QUEUE_KEY, JSON.stringify(queue));
}

export async function queueSale(offlineId: string, payload: object): Promise<void> {
  const queue = await getSalesQueue();
  // Avoid duplicates
  if (queue.some((q) => q.offlineId === offlineId)) return;
  const newEntry: QueuedSale = {
    id: Date.now(),
    offlineId,
    payload,
    createdAt: new Date().toISOString(),
    synced: false,
  };
  queue.push(newEntry);
  await saveSalesQueue(queue);
}

export async function getPendingSales(): Promise<QueuedSale[]> {
  const queue = await getSalesQueue();
  return queue.filter((q) => !q.synced);
}

export async function markSaleSynced(offlineId: string): Promise<void> {
  const queue = await getSalesQueue();
  const updated = queue.map((q) =>
    q.offlineId === offlineId ? { ...q, synced: true } : q
  );
  await saveSalesQueue(updated);
}

export async function clearSyncedSales(): Promise<void> {
  const queue = await getSalesQueue();
  const pending = queue.filter((q) => !q.synced);
  await saveSalesQueue(pending);
}

// ─── Items Cache ──────────────────────────────────────────────────────────────

export async function cacheItems(items: object[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ITEMS_CACHE_KEY, JSON.stringify(items));
  } catch {
    // Silently fail cache writes
  }
}

export async function getCachedItems(): Promise<object[]> {
  try {
    const raw = await AsyncStorage.getItem(ITEMS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearItemsCache(): Promise<void> {
  await AsyncStorage.removeItem(ITEMS_CACHE_KEY);
}
