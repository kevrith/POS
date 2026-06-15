/**
 * Offline action queue for the delivery driver.
 *
 * Drivers lose signal in basements, lifts and rural drops. Status updates
 * (picked up / delivered / failed) are written to a persistent AsyncStorage
 * queue and flushed when connectivity returns, so a tap in a dead zone is never
 * lost. Each action carries an `offlineId`; status PATCHes are idempotent
 * (setting a status twice is the same result), so replaying a request that
 * actually succeeded is safe.
 *
 * Mirrors apps/mobile-agent/lib/offline.ts but generalised to any HTTP method.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { driverApi } from './api';

const QUEUE_KEY = 'driver:action_queue';

export type QueueMethod = 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface QueuedAction {
  offlineId: string;       // idempotency key, also the queue id
  method: QueueMethod;
  path: string;            // API path
  body?: Record<string, unknown>;
  label: string;           // human description for the pending banner
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// ── Subscriptions (badges / banner) ───────────────────────────────────────────

type Listener = (queue: QueuedAction[]) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  void readQueue().then(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function notify(): Promise<void> {
  const q = await readQueue();
  listeners.forEach((fn) => fn(q));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enqueue(action: Omit<QueuedAction, 'createdAt' | 'attempts'>): Promise<void> {
  const queue = await readQueue();
  if (queue.some((a) => a.offlineId === action.offlineId)) return; // de-dupe
  queue.push({ ...action, createdAt: new Date().toISOString(), attempts: 0 });
  await writeQueue(queue);
  await notify();
}

function dispatch(action: QueuedAction): Promise<unknown> {
  switch (action.method) {
    case 'POST':
      return driverApi.post(action.path, action.body ?? {});
    case 'PATCH':
      return driverApi.patch(action.path, action.body ?? {});
    case 'PUT':
      return driverApi.patch(action.path, action.body ?? {}); // driverApi has no put; PATCH is equivalent for our routes
    case 'DELETE':
      return driverApi.delete(action.path);
  }
}

let flushing = false;

/**
 * Send every queued action oldest-first. Stops on the first network failure
 * (we're offline). A server (4xx) rejection records the error and, after 5
 * attempts, drops the action so one bad item can't block the queue forever.
 */
export async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  if (flushing) {
    const q = await readQueue();
    return { synced: 0, remaining: q.length };
  }
  flushing = true;
  let synced = 0;
  try {
    let queue = await readQueue();
    for (const action of [...queue]) {
      try {
        await dispatch(action);
        queue = queue.filter((a) => a.offlineId !== action.offlineId);
        await writeQueue(queue);
        await notify();
        synced++;
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Network request failed')) break; // offline — leave queued
        queue = queue.map((a) =>
          a.offlineId === action.offlineId ? { ...a, attempts: a.attempts + 1, lastError: msg } : a,
        );
        const failed = queue.find((a) => a.offlineId === action.offlineId);
        if (failed && failed.attempts >= 5) {
          queue = queue.filter((a) => a.offlineId !== action.offlineId);
        }
        await writeQueue(queue);
        await notify();
      }
    }
    return { synced, remaining: (await readQueue()).length };
  } finally {
    flushing = false;
  }
}

/** Lightweight RFC4122 v4 UUID — avoids a dependency. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
