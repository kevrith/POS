/**
 * Selling with no connection.
 *
 * A checkout is sent straight to the server. If there is no answer (offline, the connection dropped, a gateway
 * error, no reply in 20 s) the sale is saved on this device with its idempotency key and uploads by itself when
 * the connection is back (`syncEngine.ts`). Because the key makes the upload safe to repeat, it does not matter
 * whether the first request reached the server: an unknown outcome is queued, and the server never records a sale twice.
 *
 * What is NOT queued, and why: a sale that needs the server to finish the sale itself. A gift card must be
 * redeemed, a credit sale checked against the customer's limit, loyalty points redeemed, a room charged. Those
 * fail visibly instead, so the cashier takes another payment method, rather than a promise nobody can keep.
 */
import api, { ApiError } from './api';
import { enqueue, type OfflineSaleSummary } from './db';
import { processSyncQueue, refreshCounts } from './syncEngine';

/** Payment methods whose completion depends on a live server answer. */
export const NEEDS_SERVER_METHODS = ['GIFT_CARD', 'CREDIT', 'LOYALTY', 'ROOM', 'ROOM_CHARGE'];

/** How long to wait for the checkout reply before saving the sale offline instead. */
export const SEND_TIMEOUT_MS = 20_000;

export function canQueueOffline(input: { payments: Array<{ method: string }>; loyaltyRedeemed?: boolean; hasRestrictedMedicine?: boolean }): boolean {
  if (input.loyaltyRedeemed) return false;
  // A prescription-only or controlled medicine needs a manager's approval from the server: it cannot be promised later.
  if (input.hasRestrictedMedicine) return false;
  return input.payments.length > 0 && !input.payments.some((p) => NEEDS_SERVER_METHODS.includes(p.method.toUpperCase()));
}

/** The number on a provisional receipt: obviously not a real one, and traceable to the stored sale. */
export function provisionalReceiptNumber(offlineId: string): string {
  return `OFF-${offlineId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
}

/** True when the request got no usable answer, so the sale's fate is unknown and it is safe to queue and retry. */
export function isConnectionProblem(err: unknown): boolean {
  if (err instanceof ApiError) return [408, 502, 503, 504].includes(err.status);
  if (err instanceof Error && err.name === 'SaleTimeout') return true;
  // fetch() rejects with a TypeError when there is no network ("Failed to fetch", "Load failed", "NetworkError ...").
  return err instanceof TypeError;
}

class SaleTimeout extends Error {
  constructor() {
    super('The server did not answer in time');
    this.name = 'SaleTimeout';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SaleTimeout()), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export interface QueuedSaleInfo {
  offlineId: string;
  provisionalNumber: string;
}

export type SaleOutcome<R> =
  | { queued: false; result: R }
  | ({ queued: true } & QueuedSaleInfo);

export interface SalePayloadBase {
  offlineId: string;
  businessId: string;
  storeId: string;
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number }>;
}

export interface SubmitSaleOptions {
  /** Result of `canQueueOffline`: false means "online or fail", exactly as before. */
  canQueue: boolean;
  user: { id: string; name?: string };
  totalCents: number;
  customerName?: string;
  /** Test seam. */
  sendTimeoutMs?: number;
  isOnline?: () => boolean;
}

/** Send a sale, or save it for later when the connection fails and the sale is allowed to wait. */
export async function submitSaleOrQueue<R, P extends SalePayloadBase>(payload: P, options: SubmitSaleOptions): Promise<SaleOutcome<R>> {
  const online = (options.isOnline ?? (() => navigator.onLine))();
  if (!options.canQueue) return { queued: false, result: await api.post<R>('/sales/checkout', payload) };
  if (!online) return queueSale(payload, options, false);

  try {
    const result = await withTimeout(api.post<R>('/sales/checkout', payload), options.sendTimeoutMs ?? SEND_TIMEOUT_MS);
    return { queued: false, result };
  } catch (err) {
    if (isConnectionProblem(err)) return queueSale(payload, options, true);
    throw err; // the server answered and refused: the cashier needs to see why
  }
}

async function queueSale<P extends SalePayloadBase>(payload: P, options: SubmitSaleOptions, tryNow: boolean): Promise<SaleOutcome<never>> {
  const provisionalNumber = provisionalReceiptNumber(payload.offlineId);
  const summary: OfflineSaleSummary = {
    provisionalNumber,
    totalCents: options.totalCents,
    itemCount: payload.items.reduce((n, i) => n + i.quantity, 0),
    customerName: options.customerName,
    paymentMethods: Array.from(new Set(payload.payments.map((p) => p.method))),
  };
  // If the device cannot store it (storage full, private window), this throws and the cashier is told the sale
  // was NOT saved, which is the truth.
  await enqueue({
    offlineId: payload.offlineId,
    priority: 'NORMAL',
    endpoint: '/sales/checkout',
    method: 'POST',
    body: JSON.stringify(payload),
    kind: 'SALE',
    userId: options.user.id,
    userName: options.user.name,
    businessId: payload.businessId,
    storeId: payload.storeId,
    summary,
  });
  await refreshCounts();
  // A dropped request may have been a hiccup, so try once straight away. When the browser already knows it is
  // offline there is nothing to try: the engine uploads when the connection is back.
  if (tryNow) void processSyncQueue();
  return { queued: true, offlineId: payload.offlineId, provisionalNumber };
}
