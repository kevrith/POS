import { parseExpiry, planReceipt, type ItemFacts, type PoItemLike } from './receiving';

const NOW = new Date('2026-11-12T10:00:00Z');
const po: PoItemLike[] = [{ id: 'pi-1', itemId: 'amox', quantityOrdered: 100 }, { id: 'pi-2', itemId: 'gloves', quantityOrdered: 10 }];
const items = new Map<string, ItemFacts>([
  ['amox', { id: 'amox', name: 'Amoxicillin 500mg', trackBatches: true, isMedicine: true }],
  ['gloves', { id: 'gloves', name: 'Gloves', trackBatches: false, isMedicine: false }],
  ['water', { id: 'water', name: 'Water', trackBatches: true, isMedicine: false }],
]);
const plan = (lines: unknown[], before: Array<{ poItemId: string; quantityReceived: number }> = []) => planReceipt(po, before, lines as never, items, NOW);

describe('parseExpiry', () => {
  it('reads real dates only', () => {
    expect(parseExpiry('2027-03-31')?.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(parseExpiry('2027-02-30')).toBeNull();
    expect(parseExpiry('soon')).toBeNull();
    expect(parseExpiry('')).toBeNull();
    expect(parseExpiry(undefined)).toBeNull();
  });
});

describe('planReceipt', () => {
  it('plans a lot-tracked line with its lot and expiry, and an untracked line without', () => {
    const p = plan([{ poItemId: 'pi-1', quantityReceived: 60, batchLotNumber: ' AB123 ', expiryDate: '2028-01-31' }, { poItemId: 'pi-2', quantityReceived: 4 }]);
    expect(p[0]).toMatchObject({ itemId: 'amox', quantity: 60, trackBatches: true, lot: 'AB123' });
    expect(p[0].expiry?.toISOString()).toBe('2028-01-31T00:00:00.000Z');
    expect(p[1]).toMatchObject({ itemId: 'gloves', quantity: 4, trackBatches: false, lot: null, expiry: null });
  });

  it('needs a lot for tracked stock, and an expiry for medicines', () => {
    expect(() => plan([{ poItemId: 'pi-1', quantityReceived: 5, expiryDate: '2028-01-31' }])).toThrow(/lot \(batch\) number/);
    expect(() => plan([{ poItemId: 'pi-1', quantityReceived: 5, batchLotNumber: 'L1' }])).toThrow(/expiry date from the pack/);
    expect(() => plan([{ poItemId: 'pi-1', quantityReceived: 5, batchLotNumber: 'L1', expiryDate: '2028-02-30' }])).toThrow(/not a real date/);
  });

  it('refuses stock that has already expired, but takes one that expires today', () => {
    expect(() => plan([{ poItemId: 'pi-1', quantityReceived: 5, batchLotNumber: 'L1', expiryDate: '2026-11-11' }])).toThrow(/already expired/);
    expect(plan([{ poItemId: 'pi-1', quantityReceived: 5, batchLotNumber: 'L1', expiryDate: '2026-11-12' }])).toHaveLength(1);
  });

  it('a non-medicine lot may have no expiry', () => {
    const waterPo = [{ id: 'pi-9', itemId: 'water', quantityOrdered: 5 }];
    const p = planReceipt(waterPo, [], [{ poItemId: 'pi-9', quantityReceived: 5, batchLotNumber: 'W1' }], items, NOW);
    expect(p[0].expiry).toBeNull();
  });

  it('refuses a line that is not on the order, and bad quantities', () => {
    expect(() => plan([{ poItemId: 'pi-x', quantityReceived: 1 }])).toThrow(/not on this purchase order/);
    expect(() => plan([{ quantityReceived: 1 }])).toThrow(/not on this purchase order/);
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: -1 }])).toThrow(/zero or more/);
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: 'lots' }])).toThrow(/zero or more/);
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: 1.2345 }])).toThrow(/3 decimal/);
    expect(() => plan([])).toThrow(/Say what was received/);
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: 0 }])).toThrow(/Nothing was received/);
  });

  it('never takes in more than is still outstanding, counting earlier receipts and lines in the same note', () => {
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: 11 }])).toThrow(/10 ordered, 0 already received, so at most 10/);
    expect(() => plan([{ poItemId: 'pi-2', quantityReceived: 4 }], [{ poItemId: 'pi-2', quantityReceived: 7 }])).toThrow(/at most 3 more/);
    expect(() => plan([{ poItemId: 'pi-1', quantityReceived: 60, batchLotNumber: 'A', expiryDate: '2028-01-31' }, { poItemId: 'pi-1', quantityReceived: 50, batchLotNumber: 'B', expiryDate: '2028-02-28' }])).toThrow(/at most 100/);
    expect(plan([{ poItemId: 'pi-2', quantityReceived: 3 }], [{ poItemId: 'pi-2', quantityReceived: 7 }])).toHaveLength(1);
  });

  it('splits one order line across lots', () => {
    const p = plan([{ poItemId: 'pi-1', quantityReceived: 60, batchLotNumber: 'A', expiryDate: '2028-01-31' }, { poItemId: 'pi-1', quantityReceived: 40, batchLotNumber: 'B', expiryDate: '2028-02-28' }]);
    expect(p.map((x) => [x.lot, x.quantity])).toEqual([['A', 60], ['B', 40]]);
  });
});
