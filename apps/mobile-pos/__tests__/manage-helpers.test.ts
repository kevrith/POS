import {
  buildAdjustmentPayload,
  toCents,
  centsToInput,
  stockStatus,
  daysUntil,
  expiryBucket,
  countVariance,
  validateItemForm,
  offlineId,
} from '../lib/manage-helpers';

const base = { itemId: 'i1', storeId: 's1', businessId: 'b1' };

describe('buildAdjustmentPayload', () => {
  it('RECEIVE produces a positive GRN_RECEIPT movement', () => {
    const p = buildAdjustmentPayload({ ...base, mode: 'RECEIVE', amount: 5 });
    expect(p).toEqual({ ...base, type: 'GRN_RECEIPT', quantity: 5, notes: undefined });
  });

  it('RECEIVE treats negative input as its magnitude', () => {
    const p = buildAdjustmentPayload({ ...base, mode: 'RECEIVE', amount: -8 });
    expect(p?.quantity).toBe(8);
  });

  it('REMOVE produces a negative ADJUSTMENT movement', () => {
    const p = buildAdjustmentPayload({ ...base, mode: 'REMOVE', amount: 3 });
    expect(p?.type).toBe('ADJUSTMENT');
    expect(p?.quantity).toBe(-3);
  });

  it('SET computes the signed delta from current stock', () => {
    expect(buildAdjustmentPayload({ ...base, mode: 'SET', amount: 12, currentStock: 10 })?.quantity).toBe(2);
    expect(buildAdjustmentPayload({ ...base, mode: 'SET', amount: 7, currentStock: 10 })?.quantity).toBe(-3);
  });

  it('returns null for a no-op (zero delta)', () => {
    expect(buildAdjustmentPayload({ ...base, mode: 'SET', amount: 10, currentStock: 10 })).toBeNull();
    expect(buildAdjustmentPayload({ ...base, mode: 'RECEIVE', amount: 0 })).toBeNull();
  });

  it('trims notes and drops empty ones', () => {
    expect(buildAdjustmentPayload({ ...base, mode: 'RECEIVE', amount: 1, notes: '  hi ' })?.notes).toBe('hi');
    expect(buildAdjustmentPayload({ ...base, mode: 'RECEIVE', amount: 1, notes: '   ' })?.notes).toBeUndefined();
  });
});

describe('money helpers', () => {
  it('converts KES major units to integer cents', () => {
    expect(toCents('10')).toBe(1000);
    expect(toCents('10.5')).toBe(1050);
    expect(toCents('0.99')).toBe(99);
    expect(toCents(2.345)).toBe(235); // rounds
  });
  it('rejects bad / negative input as 0', () => {
    expect(toCents('abc')).toBe(0);
    expect(toCents('-5')).toBe(0);
    expect(toCents('')).toBe(0);
  });
  it('formats cents back to an editable string', () => {
    expect(centsToInput(1000)).toBe('10');
    expect(centsToInput(1050)).toBe('10.5');
    expect(centsToInput(null)).toBe('');
    expect(centsToInput(undefined)).toBe('');
  });
});

describe('stockStatus', () => {
  it('flags zero / negative as OUT', () => {
    expect(stockStatus(0)).toBe('OUT');
    expect(stockStatus(-2, 5)).toBe('OUT');
  });
  it('flags at/below reorder level as LOW', () => {
    expect(stockStatus(3, 5)).toBe('LOW');
    expect(stockStatus(5, 5)).toBe('LOW');
  });
  it('returns OK above reorder level or when none set', () => {
    expect(stockStatus(6, 5)).toBe('OK');
    expect(stockStatus(1)).toBe('OK');
    expect(stockStatus(1, 0)).toBe('OK');
  });
});

describe('expiry helpers', () => {
  const now = new Date('2026-06-15T00:00:00Z');
  it('computes days until a date', () => {
    expect(daysUntil('2026-06-20T00:00:00Z', now)).toBe(5);
    expect(daysUntil('2026-06-10T00:00:00Z', now)).toBe(-5);
  });
  it('buckets batches by closeness to expiry', () => {
    expect(expiryBucket('2026-06-10T00:00:00Z', now)).toBe('EXPIRED');
    expect(expiryBucket('2026-06-18T00:00:00Z', now)).toBe('CRITICAL');
    expect(expiryBucket('2026-07-10T00:00:00Z', now)).toBe('WARNING');
    expect(expiryBucket('2026-12-10T00:00:00Z', now)).toBe('OK');
    expect(expiryBucket(null, now)).toBe('OK');
  });
});

describe('countVariance', () => {
  it('returns counted minus expected (negative = shrink)', () => {
    expect(countVariance(10, 8)).toBe(-2);
    expect(countVariance(10, 13)).toBe(3);
    expect(countVariance(10, 10)).toBe(0);
  });
});

describe('validateItemForm', () => {
  it('requires a name', () => {
    expect(validateItemForm({ name: '', priceKes: '10' })).toMatch(/name/i);
  });
  it('requires a valid positive price', () => {
    expect(validateItemForm({ name: 'Soda', priceKes: '0' })).toMatch(/price/i);
    expect(validateItemForm({ name: 'Soda', priceKes: 'abc' })).toMatch(/price/i);
  });
  it('passes a valid item', () => {
    expect(validateItemForm({ name: 'Soda', priceKes: '50' })).toBeNull();
  });
});

describe('offlineId', () => {
  it('is 32 lowercase-alphanumeric chars and unique enough', () => {
    const a = offlineId();
    const b = offlineId();
    expect(a).toMatch(/^[a-z0-9]{32}$/);
    expect(a).not.toBe(b);
  });
});
