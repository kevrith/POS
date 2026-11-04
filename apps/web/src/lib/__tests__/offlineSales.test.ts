import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
class FakeApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}
vi.mock('../api', () => ({
  default: { post: (...a: unknown[]) => post(...a) },
  ApiError: FakeApiError,
  getToken: () => 't',
  getApiUrl: () => '/api/v1',
}));

let authUser: { id: string; role: string } | null = { id: 'amina', role: 'CASHIER' };
vi.mock('../../stores/auth', () => ({
  useAuthStore: { getState: () => ({ user: authUser }), subscribe: vi.fn() },
}));

vi.stubGlobal('navigator', { onLine: true });

const { db, enqueue } = await import('../db');
const engine = await import('../syncEngine');
const sales = await import('../offlineSales');
const { useSyncStore } = await import('../../stores/sync');

const KEY = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const payload = (offlineId = KEY) => ({
  offlineId, businessId: 'biz-1', storeId: 'store-1', cashierId: 'amina',
  items: [{ itemId: 'item-1', quantity: 2 }], payments: [{ method: 'CASH', amountCents: 100000 }],
});

async function queueSale(offlineId: string, userId = 'amina', extra: Record<string, unknown> = {}) {
  await enqueue({
    offlineId, priority: 'NORMAL', endpoint: '/sales/checkout', method: 'POST', body: JSON.stringify(payload(offlineId)),
    kind: 'SALE', userId, userName: userId, businessId: 'biz-1', storeId: 'store-1', ...extra,
  });
}
const rows = () => db.syncQueue.orderBy('createdAt').toArray();
const byKey = async (k: string) => (await rows()).find((r) => r.offlineId === k)!;

beforeEach(async () => {
  engine.setUploadTimeoutForTests(60);
  await engine.whenIdle(); // a run started by an earlier test must not leak into this one
  await db.syncQueue.clear();
  post.mockReset();
  authUser = { id: 'amina', role: 'CASHIER' };
  vi.stubGlobal('navigator', { onLine: true });
});

describe('canQueueOffline', () => {
  it('lets cash, card, M-Pesa and bank sales wait, but not anything the server must complete', () => {
    for (const m of ['CASH', 'CARD', 'MPESA', 'BANK_TRANSFER']) expect(sales.canQueueOffline({ payments: [{ method: m }] })).toBe(true);
    for (const m of ['GIFT_CARD', 'CREDIT', 'LOYALTY', 'ROOM', 'gift_card']) expect(sales.canQueueOffline({ payments: [{ method: m }] })).toBe(false);
    expect(sales.canQueueOffline({ payments: [{ method: 'CASH' }, { method: 'GIFT_CARD' }] })).toBe(false);
    expect(sales.canQueueOffline({ payments: [{ method: 'CASH' }], loyaltyRedeemed: true })).toBe(false);
    expect(sales.canQueueOffline({ payments: [] })).toBe(false);
  });

  it('gives a provisional number that cannot be mistaken for a real receipt number', () => {
    expect(sales.provisionalReceiptNumber(KEY)).toBe('OFF-A1B2C3D4');
  });
});

describe('submitSaleOrQueue', () => {
  const opts = { canQueue: true, user: { id: 'amina', name: 'Amina' }, totalCents: 100000, customerName: 'Mama Njeri' };

  it('online: sends the sale and queues nothing', async () => {
    post.mockResolvedValue({ id: 's1', receiptNumber: 'R-1' });
    const out = await sales.submitSaleOrQueue(payload(), opts);
    expect(out).toEqual({ queued: false, result: { id: 's1', receiptNumber: 'R-1' } });
    expect(await rows()).toHaveLength(0);
  });

  it('no connection (the request fails): the sale is SAVED with who made it and what it was', async () => {
    post.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValue(new TypeError('Failed to fetch'));
    const out = await sales.submitSaleOrQueue(payload(), opts);
    expect(out).toEqual({ queued: true, offlineId: KEY, provisionalNumber: 'OFF-A1B2C3D4' });
    const [entry] = await rows();
    expect(entry).toMatchObject({
      offlineId: KEY, kind: 'SALE', status: 'PENDING', userId: 'amina', userName: 'Amina', storeId: 'store-1', endpoint: '/sales/checkout',
      summary: { provisionalNumber: 'OFF-A1B2C3D4', totalCents: 100000, itemCount: 2, customerName: 'Mama Njeri', paymentMethods: ['CASH'] },
    });
    expect(JSON.parse(entry.body).offlineId).toBe(KEY); // the key travels with it, so the upload is safe to repeat
  });

  it('the browser knows it is offline: queues without trying the network', async () => {
    const out = await sales.submitSaleOrQueue(payload(), { ...opts, isOnline: () => false });
    expect(out.queued).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('a gateway error (502/503/504) is a connection problem: queued', async () => {
    for (const status of [502, 503, 504]) {
      await db.syncQueue.clear();
      post.mockReset();
      post.mockRejectedValue(new FakeApiError('Bad gateway', status));
      expect((await sales.submitSaleOrQueue(payload(`k${status}aaaaaaaa`), opts)).queued).toBe(true);
    }
  });

  it('no reply in time: the outcome is unknown, so it is queued (replay is safe thanks to the key)', async () => {
    expect(sales.SEND_TIMEOUT_MS).toBe(20_000);
    post.mockImplementation(() => new Promise(() => undefined)); // never answers
    const out = await sales.submitSaleOrQueue(payload(), { ...opts, sendTimeoutMs: 30 });
    expect(out.queued).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it('when the SERVER refuses the sale the cashier is told, and nothing is queued', async () => {
    post.mockRejectedValue(new FakeApiError('Insufficient stock for Cappuccino', 400));
    await expect(sales.submitSaleOrQueue(payload(), opts)).rejects.toThrow('Insufficient stock');
    expect(await rows()).toHaveLength(0);
    post.mockRejectedValue(new FakeApiError('Boom', 500));
    await expect(sales.submitSaleOrQueue(payload(), opts)).rejects.toThrow('Boom');
    expect(await rows()).toHaveLength(0);
  });

  it('a sale that needs the server behaves exactly as before: online or an error, never queued', async () => {
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sales.submitSaleOrQueue(payload(), { ...opts, canQueue: false })).rejects.toBeInstanceOf(TypeError);
    expect(await rows()).toHaveLength(0);
  });
});

describe('uploading the queue', () => {
  it('uploads a sale exactly as saved, marks it DONE with the real receipt, and registers it with KRA', async () => {
    await queueSale('sale-aaaaaaaa');
    post.mockImplementation(async (path: string) => (path === '/sales/checkout' ? { id: 'srv-1', receiptNumber: 'NRB01-2026-0000042' } : { success: true }));
    const res = await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(res).toEqual({ synced: 1, rejected: 0, waiting: 0 });
    const e = await byKey('sale-aaaaaaaa');
    expect(e.status).toBe('DONE');
    expect(JSON.parse(e.resultData as string).receiptNumber).toBe('NRB01-2026-0000042');
    expect(post).toHaveBeenCalledWith('/sales/checkout', expect.objectContaining({ offlineId: 'sale-aaaaaaaa' }));
    expect(post).toHaveBeenCalledWith('/etims/submit/srv-1');
    expect(useSyncStore.getState().pendingCount).toBe(0);
  });

  it('LOST CONNECTION never costs a sale its place or an attempt, and the run stops instead of hammering', async () => {
    await queueSale('sale-aaaaaaaa'); await queueSale('sale-bbbbbbbb');
    post.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(post).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ synced: 0, waiting: 2 });
    const e = await byKey('sale-aaaaaaaa');
    expect(e).toMatchObject({ status: 'PENDING', attempts: 0 });
    expect((await byKey('sale-bbbbbbbb')).status).toBe('PENDING');
    expect(useSyncStore.getState().pendingCount).toBe(2);
  });

  it('a REFUSED sale is parked for a person with the reason, and does not block the sales behind it', async () => {
    await queueSale('sale-aaaaaaaa'); await queueSale('sale-bbbbbbbb');
    post.mockImplementation(async (path: string, body: any) => {
      if (path !== '/sales/checkout') return { success: true };
      if (body.offlineId === 'sale-aaaaaaaa') throw new FakeApiError('Insufficient stock for Cappuccino', 400);
      return { id: 'srv-2', receiptNumber: 'R-2' };
    });
    const res = await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(res).toMatchObject({ synced: 1, rejected: 1 });
    expect(await byKey('sale-aaaaaaaa')).toMatchObject({ status: 'FAILED', lastError: 'Insufficient stock for Cappuccino' });
    expect((await byKey('sale-bbbbbbbb')).status).toBe('DONE');
    expect(useSyncStore.getState().rejectedCount).toBe(1);
  });

  it('a server error backs off and retries, then gives up visibly after 10 attempts', async () => {
    await queueSale('sale-aaaaaaaa');
    post.mockRejectedValue(new FakeApiError('Internal error', 500));
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    let e = await byKey('sale-aaaaaaaa');
    expect(e.status).toBe('PENDING');
    expect(e.attempts).toBe(1);
    expect(e.nextAttemptAt).toBeGreaterThan(Date.now());
    expect(await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' })).toMatchObject({ synced: 0 }); // not due yet
    expect(post).toHaveBeenCalledTimes(1);

    await db.syncQueue.update(e.id!, { attempts: engine.MAX_SERVER_ERROR_ATTEMPTS - 1, nextAttemptAt: 0 });
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    e = await byKey('sale-aaaaaaaa');
    expect(e.status).toBe('FAILED');
  });

  it('a cashier uploads only their OWN sales; a different cashier leaves them alone', async () => {
    await queueSale('sale-by-amina', 'amina');
    post.mockResolvedValue({ id: 'x', receiptNumber: 'R' });
    const res = await engine.processSyncQueue({ id: 'brian', role: 'CASHIER' });
    expect(post).not.toHaveBeenCalled();
    expect(res).toEqual({ synced: 0, rejected: 0, waiting: 1 });
    expect((await byKey('sale-by-amina')).status).toBe('PENDING');
  });

  it('a manager uploads it ON BEHALF of the cashier who made it; the cashier uploading their own adds nothing', async () => {
    await queueSale('sale-by-amina', 'amina');
    post.mockResolvedValue({ id: 'x', receiptNumber: 'R' });
    await engine.processSyncQueue({ id: 'joy', role: 'MANAGER' });
    expect(post.mock.calls[0][1].onBehalfOfCashierId).toBe('amina');

    await db.syncQueue.clear(); post.mockClear();
    await queueSale('sale-by-amina2', 'amina');
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(post.mock.calls[0][1].onBehalfOfCashierId).toBeUndefined();
  });

  it('an upload abandoned by a closed tab is taken over after a minute, not before', async () => {
    await queueSale('sale-aaaaaaaa');
    const e = await byKey('sale-aaaaaaaa');
    await db.syncQueue.update(e.id!, { status: 'SYNCING', claimedAt: Date.now() - 5_000 });
    post.mockResolvedValue({ id: 'x', receiptNumber: 'R' });
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(post).not.toHaveBeenCalled();
    await db.syncQueue.update(e.id!, { claimedAt: Date.now() - 120_000 });
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(post.mock.calls.filter((c) => c[0] === '/sales/checkout')).toHaveLength(1);
  });

  it('overlapping runs share one, so a sale is never uploaded twice at once', async () => {
    await queueSale('sale-aaaaaaaa');
    engine.setUploadTimeoutForTests(5_000);
    let release!: () => void;
    post.mockImplementation((path: string) => (path === '/sales/checkout'
      ? new Promise((resolve) => { release = () => resolve({ id: 'x', receiptNumber: 'R' }); })
      : Promise.resolve({ success: true })));
    const a = engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    const b = engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect(a).toBe(b);
    await vi.waitFor(() => expect(post).toHaveBeenCalled());
    release();
    await a;
    expect(post.mock.calls.filter((c) => c[0] === '/sales/checkout')).toHaveLength(1);
  });

  it('a request that never answers cannot block the queue: it times out, keeps its place and its attempt', async () => {
    await queueSale('sale-aaaaaaaa');
    post.mockImplementation(() => new Promise(() => undefined));
    const res = await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' }, { uploadTimeoutMs: 30 });
    expect(res).toMatchObject({ synced: 0, waiting: 1 });
    expect(await byKey('sale-aaaaaaaa')).toMatchObject({ status: 'PENDING', attempts: 0 });
    // and the next run is free to go
    post.mockResolvedValue({ id: 'x', receiptNumber: 'R' });
    expect((await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' })).synced).toBe(1);
  });

  it('does nothing when nobody is signed in', async () => {
    await queueSale('sale-aaaaaaaa');
    authUser = null;
    expect(await engine.processSyncQueue()).toEqual({ synced: 0, rejected: 0, waiting: 0 });
    expect(post).not.toHaveBeenCalled();
  });

  it('retry puts a refused sale back in line; discard removes it; old finished entries are purged', async () => {
    await queueSale('sale-aaaaaaaa'); await queueSale('sale-bbbbbbbb'); await queueSale('sale-cccccccc');
    const [a, b, c] = await rows();
    await db.syncQueue.update(a.id!, { status: 'FAILED', attempts: 3, lastError: 'x' });
    post.mockRejectedValue(new TypeError('offline'));
    await engine.retryEntry(a.id!);
    await engine.whenIdle(); // retry starts an upload run in the background
    expect(await byKey('sale-aaaaaaaa')).toMatchObject({ status: 'PENDING', attempts: 0 });

    await engine.discardEntry(b.id!);
    expect((await rows()).map((r) => r.offlineId)).not.toContain('sale-bbbbbbbb');

    await db.syncQueue.update(c.id!, { status: 'DONE', processedAt: Date.now() - 8 * 24 * 3600 * 1000 });
    post.mockResolvedValue({ id: 'x', receiptNumber: 'R' });
    await engine.processSyncQueue({ id: 'amina', role: 'CASHIER' });
    expect((await rows()).map((r) => r.offlineId)).not.toContain('sale-cccccccc');
  });

  it('classifies failures: refusals vs connection problems vs server errors', () => {
    const { classifyFailure } = engine;
    expect(classifyFailure(new FakeApiError('x', 400))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('x', 403))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('x', 404))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('x', 409))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('x', 429))).toBe('retry');
    expect(classifyFailure(new FakeApiError('x', 503))).toBe('retry');
    expect(classifyFailure(new FakeApiError('x', 500))).toBe('server-error');
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('retry');
    expect(classifyFailure(new Error('Session expired'))).toBe('retry');
  });
});
