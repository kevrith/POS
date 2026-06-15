/**
 * Offline action queue for the field-sales agent.
 *
 * Agents work where there is no signal. Mutations (orders, customer
 * registrations, payments) are written to a persistent AsyncStorage queue and
 * flushed to the API whenever connectivity returns. Every action carries an
 * `offlineId` (UUID) that the backend uses to deduplicate replays, so retrying
 * a request that actually succeeded never double-creates or double-charges.
 *
 * Flow: a mutation always enqueues first, then we try to flush immediately.
 * If the network is down the action stays queued; the UI reads from the queue
 * for an optimistic view. This makes "create" feel instant offline and
 * guarantees at-least-once delivery with server-side idempotency.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { agentApi } from './api';

const QUEUE_KEY = 'agent:action_queue';

export type ActionType = 'CREATE_ORDER' | 'REGISTER_CUSTOMER' | 'COLLECT_PAYMENT' | 'LOG_VISIT';

export interface QueuedAction {
  offlineId: string;       // idempotency key, also the queue id
  type: ActionType;
  path: string;            // API path to POST to
  body: Record<string, unknown>;
  label: string;          // human description for the pending list
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// ── Low-level persistence ────────────────────────────────────────────────────

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

// ── Subscriptions (so screens can show pending count / re-render) ────────────

type Listener = (queue: QueuedAction[]) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  void readQueue().then(fn);
  return () => listeners.delete(fn);
}

async function notify(): Promise<void> {
  const q = await readQueue();
  listeners.forEach((fn) => fn(q));
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getQueue(): Promise<QueuedAction[]> {
  return readQueue();
}

export async function enqueue(
  action: Omit<QueuedAction, 'createdAt' | 'attempts'>,
): Promise<void> {
  const queue = await readQueue();
  if (queue.some((a) => a.offlineId === action.offlineId)) return; // de-dupe
  queue.push({ ...action, createdAt: new Date().toISOString(), attempts: 0 });
  await writeQueue(queue);
  await notify();
}

let flushing = false;

/**
 * Try to send every queued action to the API, oldest first. Stops on the first
 * network failure (we're offline — no point hammering). Server (4xx) errors
 * drop the action from the queue with the error recorded, so one bad action
 * can't block the rest forever. Returns how many synced.
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
        await agentApi.post(action.path, action.body);
        queue = queue.filter((a) => a.offlineId !== action.offlineId);
        await writeQueue(queue);
        await notify();
        synced++;
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('Network request failed')) {
          // Offline — leave this and everything after it queued.
          break;
        }
        // Server rejected it (validation, etc.). Record the error and drop it
        // so the queue can drain; the agent sees it in the pending screen.
        queue = queue.map((a) =>
          a.offlineId === action.offlineId
            ? { ...a, attempts: a.attempts + 1, lastError: msg }
            : a,
        );
        // After 5 failed server attempts, give up on this action.
        const failed = queue.find((a) => a.offlineId === action.offlineId);
        if (failed && failed.attempts >= 5) {
          queue = queue.filter((a) => a.offlineId !== action.offlineId);
        }
        await writeQueue(queue);
        await notify();
      }
    }
    const remaining = (await readQueue()).length;
    return { synced, remaining };
  } finally {
    flushing = false;
  }
}

export async function removeAction(offlineId: string): Promise<void> {
  const queue = (await readQueue()).filter((a) => a.offlineId !== offlineId);
  await writeQueue(queue);
  await notify();
}

/** Lightweight UUID (RFC4122 v4) — avoids pulling in a dependency. */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
