import {
  normalizePoStatus, canReceive, receivedQty, outstandingQty, poProgress, poTotalCents,
  buildGrnPayload, parseQty, isValidExpiry, PO_STATUSES, PO_STATUS_LABELS,
  type PurchaseOrder, type Grn,
} from '../lib/receiving';

const grns: Grn[] = [
  { id: 'g1', receivedAt: '2026-08-01T00:00:00Z', items: [{ poItemId: 'li1', quantityReceived: 4 }] },
  { id: 'g2', receivedAt: '2026-08-05T00:00:00Z', items: [{ poItemId: 'li1', quantityReceived: 3 }, { poItemId: 'li2', quantityReceived: 10 }] },
];

const po: PurchaseOrder = {
  id: 'po1', poNumber: 'PO-0001', status: 'PARTIALLY_RECEIVED', createdAt: '2026-07-28T00:00:00Z',
  items: [
    { id: 'li1', itemId: 'i1', quantityOrdered: 12, agreedPriceCents: 5_000 },
    { id: 'li2', itemId: 'i2', quantityOrdered: 10, agreedPriceCents: 2_000 },
  ],
  grns,
};

describe('normalizePoStatus', () => {
  it('accepts every real status', () => {
    for (const st of PO_STATUSES) expect(normalizePoStatus(st)).toBe(st);
  });

  it('falls back to DRAFT for junk', () => {
    expect(normalizePoStatus('WHATEVER')).toBe('DRAFT');
    expect(normalizePoStatus(null)).toBe('DRAFT');
  });

  it('labels every status', () => {
    for (const st of PO_STATUSES) expect(PO_STATUS_LABELS[st].length).toBeGreaterThan(0);
  });
});

describe('canReceive', () => {
  // The API rejects a GRN against anything else, so the button must match.
  it('allows only approved and part-received orders', () => {
    expect(canReceive('APPROVED')).toBe(true);
    expect(canReceive('PARTIALLY_RECEIVED')).toBe(true);
    expect(canReceive('DRAFT')).toBe(false);
    expect(canReceive('SUBMITTED')).toBe(false);
    expect(canReceive('RECEIVED')).toBe(false);
    expect(canReceive('CANCELLED')).toBe(false);
  });
});

describe('receivedQty', () => {
  it('sums the same line across multiple GRNs', () => {
    expect(receivedQty('li1', grns)).toBe(7);
  });

  it('is zero for a line never received, or with no GRNs at all', () => {
    expect(receivedQty('li9', grns)).toBe(0);
    expect(receivedQty('li1', undefined)).toBe(0);
    expect(receivedQty('li1', [])).toBe(0);
  });
});

describe('outstandingQty', () => {
  it('reports what is still owed', () => {
    expect(outstandingQty(po.items[0], grns)).toBe(5);
    expect(outstandingQty(po.items[1], grns)).toBe(0);
  });

  // Suppliers over-deliver; a negative outstanding would pre-fill the receive
  // form with nonsense.
  it('clamps at zero when more arrived than was ordered', () => {
    const over: Grn[] = [{ id: 'g', receivedAt: '', items: [{ poItemId: 'li1', quantityReceived: 20 }] }];
    expect(outstandingQty(po.items[0], over)).toBe(0);
  });
});

describe('poProgress', () => {
  it('counts units and completed lines', () => {
    const p = poProgress(po);
    expect(p.lines).toBe(2);
    expect(p.linesComplete).toBe(1);
    expect(p.unitsOrdered).toBe(22);
    expect(p.unitsReceived).toBe(17);
    expect(p.percent).toBe(77);
    expect(p.fullyReceived).toBe(false);
  });

  it('reaches 100% and fullyReceived when every line is complete', () => {
    const done = poProgress({
      ...po,
      grns: [{ id: 'g', receivedAt: '', items: [{ poItemId: 'li1', quantityReceived: 12 }, { poItemId: 'li2', quantityReceived: 10 }] }],
    });
    expect(done.percent).toBe(100);
    expect(done.fullyReceived).toBe(true);
  });

  // An over-delivery on one line must not make the whole PO read as >100%.
  it('caps credited units at the quantity ordered', () => {
    const over = poProgress({
      ...po,
      grns: [{ id: 'g', receivedAt: '', items: [{ poItemId: 'li1', quantityReceived: 50 }] }],
    });
    expect(over.unitsReceived).toBe(12);
    expect(over.percent).toBeLessThanOrEqual(100);
    expect(over.fullyReceived).toBe(false);
  });

  it('does not divide by zero on an empty PO', () => {
    const empty = poProgress({ ...po, items: [], grns: [] });
    expect(empty.percent).toBe(0);
    expect(empty.fullyReceived).toBe(false);
  });
});

describe('poTotalCents', () => {
  it('multiplies quantity by agreed price across lines', () => {
    expect(poTotalCents(po)).toBe(12 * 5_000 + 10 * 2_000);
  });
});

describe('parseQty', () => {
  it('reads whole units and floors fractions', () => {
    expect(parseQty('12')).toBe(12);
    expect(parseQty(' 7 ')).toBe(7);
    expect(parseQty('3.9')).toBe(3);
  });

  it('returns 0 for junk and negatives rather than throwing', () => {
    expect(parseQty('')).toBe(0);
    expect(parseQty('abc')).toBe(0);
    expect(parseQty('-5')).toBe(0);
  });
});

describe('isValidExpiry', () => {
  it('accepts an empty value, since expiry is optional', () => {
    expect(isValidExpiry('')).toBe(true);
    expect(isValidExpiry('   ')).toBe(true);
  });

  it('accepts YYYY-MM-DD', () => {
    expect(isValidExpiry('2027-03-31')).toBe(true);
  });

  // A free-text date would reach `new Date(...)` on the server and become an
  // Invalid Date, silently storing a broken expiry.
  it('rejects other formats and impossible dates', () => {
    expect(isValidExpiry('31/03/2027')).toBe(false);
    expect(isValidExpiry('March 2027')).toBe(false);
    expect(isValidExpiry('2027-13-45')).toBe(false);
  });
});

describe('buildGrnPayload', () => {
  it('drops lines left at zero', () => {
    const payload = buildGrnPayload([
      { poItemId: 'a', quantityReceived: 5 },
      { poItemId: 'b', quantityReceived: 0 },
    ]);
    expect(payload).toHaveLength(1);
    expect(payload[0].poItemId).toBe('a');
  });

  it('includes batch and expiry only when filled in', () => {
    const [full, bare] = buildGrnPayload([
      { poItemId: 'a', quantityReceived: 1, batchLotNumber: ' L22 ', expiryDate: ' 2027-01-01 ' },
      { poItemId: 'b', quantityReceived: 1, batchLotNumber: '  ', expiryDate: '' },
    ]);
    expect(full).toMatchObject({ batchLotNumber: 'L22', expiryDate: '2027-01-01' });
    expect(bare).not.toHaveProperty('batchLotNumber');
    expect(bare).not.toHaveProperty('expiryDate');
  });

  it('returns an empty payload when nothing was entered', () => {
    expect(buildGrnPayload([{ poItemId: 'a', quantityReceived: 0 }])).toEqual([]);
  });
});
