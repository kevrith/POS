import { bucketOf, expirySummary, type LotRow } from './expiry-summary';

const NOW = new Date('2026-11-12T10:00:00Z');
const lot = (o: Partial<LotRow> = {}): LotRow => ({ quantityRemaining: 10, expiryDate: new Date('2027-06-30T00:00:00Z'), status: 'ACTIVE', unitCostCents: 1000, ...o });
const on = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('bucketOf', () => {
  it('sorts by days left, counting today as still in date', () => {
    expect(bucketOf(lot({ expiryDate: on('2026-11-11') }), NOW)).toBe('expired');
    expect(bucketOf(lot({ expiryDate: on('2026-11-12') }), NOW)).toBe('within30');
    expect(bucketOf(lot({ expiryDate: on('2026-12-12') }), NOW)).toBe('within30');
    expect(bucketOf(lot({ expiryDate: on('2026-12-13') }), NOW)).toBe('within60');
    expect(bucketOf(lot({ expiryDate: on('2027-01-11') }), NOW)).toBe('within60');
    expect(bucketOf(lot({ expiryDate: on('2027-02-10') }), NOW)).toBe('within90');
    expect(bucketOf(lot({ expiryDate: on('2027-02-11') }), NOW)).toBe('later');
    expect(bucketOf(lot({ expiryDate: null }), NOW)).toBe('noExpiry');
  });
  it('a recalled lot is its own bucket whatever its date', () => {
    expect(bucketOf(lot({ status: 'RECALLED', expiryDate: on('2026-01-01') }), NOW)).toBe('recalled');
  });
});

describe('expirySummary', () => {
  it('adds up lots, units and cost per bucket, and a total', () => {
    const s = expirySummary([
      lot({ expiryDate: on('2026-10-01'), quantityRemaining: 5, unitCostCents: 200 }),
      lot({ expiryDate: on('2026-10-01'), quantityRemaining: 2.5, unitCostCents: 400 }),
      lot({ expiryDate: on('2026-11-30'), quantityRemaining: 10, unitCostCents: 1000 }),
      lot({ status: 'RECALLED', quantityRemaining: 3, unitCostCents: 100 }),
    ], NOW);
    expect(s.expired).toEqual({ lots: 2, units: 7.5, costCents: 2000 });
    expect(s.within30).toEqual({ lots: 1, units: 10, costCents: 10000 });
    expect(s.recalled).toEqual({ lots: 1, units: 3, costCents: 300 });
    expect(s.total).toEqual({ lots: 4, units: 20.5, costCents: 12300 });
  });
  it('leaves out lots with nothing left and lots already written off', () => {
    const s = expirySummary([lot({ quantityRemaining: 0 }), lot({ status: 'WRITTEN_OFF' }), lot({ quantityRemaining: -1 })], NOW);
    expect(s.total).toEqual({ lots: 0, units: 0, costCents: 0 });
  });
});
