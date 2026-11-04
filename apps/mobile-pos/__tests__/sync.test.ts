/**
 * The offline sales queue: what counts as a failure that retrying can fix, and what must wait for a person.
 * db and api are replaced, so no device storage or network is needed.
 */
const pending: any[] = [];
const markSaleSynced = jest.fn(async (id: string) => { const i = pending.findIndex((p) => p.offlineId === id); if (i >= 0) pending.splice(i, 1); });
const recordSaleFailure = jest.fn(async () => undefined);
const post = jest.fn();

class FakeApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

jest.mock('../lib/db', () => ({
  getPendingSales: async () => [...pending],
  markSaleSynced: (id: string) => markSaleSynced(id),
  recordSaleFailure: (...a: unknown[]) => (recordSaleFailure as any)(...a),
}));
jest.mock('../lib/api', () => ({
  ApiError: FakeApiError,
  mobileApi: { post: (...a: unknown[]) => post(...a) },
}));

import { classifyFailure, processSyncQueue } from '../lib/sync';

const sale = (id: string) => ({ id: 1, offlineId: id, payload: { storeId: 's1', items: [] }, createdAt: '2026-11-04T10:00:00Z', synced: false });

beforeEach(() => {
  pending.length = 0;
  jest.clearAllMocks();
});

describe('classifyFailure', () => {
  it('a server refusal is parked for a person; transient problems are retried', () => {
    expect(classifyFailure(new FakeApiError('Insufficient stock', 400))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('Invalid store', 400))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('Forbidden', 403))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('Unprocessable', 422))).toBe('rejected');
    expect(classifyFailure(new FakeApiError('Timeout', 408))).toBe('retry');
    expect(classifyFailure(new FakeApiError('Too many requests', 429))).toBe('retry');
    expect(classifyFailure(new FakeApiError('Bad gateway', 502))).toBe('retry');
    expect(classifyFailure(new Error('Network request failed'))).toBe('retry');
  });

  it('an expired login is nobody\'s fault', () => {
    expect(classifyFailure(new FakeApiError('expired', 401))).toBe('auth');
  });
});

describe('processSyncQueue', () => {
  it('uploads oldest first, sends the sale\'s own idempotency key, and marks each synced', async () => {
    pending.push(sale('aaaaaaaa1'), sale('bbbbbbbb2'));
    post.mockResolvedValue({});
    const res = await processSyncQueue();
    expect(res).toEqual({ synced: 2, rejected: 0, failed: 0 });
    expect(post.mock.calls.map((c) => c[1].offlineId)).toEqual(['aaaaaaaa1', 'bbbbbbbb2']);
    expect(post).toHaveBeenCalledWith('/sales/checkout', expect.objectContaining({ storeId: 's1' }));
    expect(markSaleSynced).toHaveBeenCalledTimes(2);
  });

  it('a refused sale is parked and does NOT hold up the sales behind it', async () => {
    pending.push(sale('aaaaaaaa1'), sale('bbbbbbbb2'));
    post.mockRejectedValueOnce(new FakeApiError('Insufficient stock for Cappuccino', 400)).mockResolvedValueOnce({});
    const res = await processSyncQueue();
    expect(res).toEqual({ synced: 1, rejected: 1, failed: 0 });
    expect(recordSaleFailure).toHaveBeenCalledWith('aaaaaaaa1', 'Insufficient stock for Cappuccino', true);
    expect(markSaleSynced).toHaveBeenCalledWith('bbbbbbbb2');
  });

  it('when offline it stops at the first failure instead of hammering, and keeps every sale', async () => {
    pending.push(sale('aaaaaaaa1'), sale('bbbbbbbb2'), sale('cccccccc3'));
    post.mockRejectedValue(new Error('Network request failed'));
    const res = await processSyncQueue();
    expect(post).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ synced: 0, rejected: 0, failed: 3 });
    expect(recordSaleFailure).toHaveBeenCalledWith('aaaaaaaa1', 'Network request failed', false);
    expect(markSaleSynced).not.toHaveBeenCalled();
  });

  it('an expired login stops the run without blaming any sale', async () => {
    pending.push(sale('aaaaaaaa1'), sale('bbbbbbbb2'));
    post.mockRejectedValue(new FakeApiError('Your session has expired', 401));
    const res = await processSyncQueue();
    expect(res.synced).toBe(0);
    expect(res.failed).toBe(2);
    expect(recordSaleFailure).not.toHaveBeenCalled();
  });

  it('callers that overlap share ONE run, so a sale is never uploaded twice at once', async () => {
    pending.push(sale('aaaaaaaa1'));
    let release!: () => void;
    post.mockImplementation(() => new Promise((resolve) => { release = () => resolve({}); }));
    const first = processSyncQueue();
    const second = processSyncQueue();
    await new Promise((r) => setImmediate(r));
    release();
    const [a, b] = await Promise.all([first, second]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('can run again after a run finishes', async () => {
    pending.push(sale('aaaaaaaa1'));
    post.mockResolvedValue({});
    await processSyncQueue();
    pending.push(sale('bbbbbbbb2'));
    await processSyncQueue();
    expect(post).toHaveBeenCalledTimes(2);
  });
});
