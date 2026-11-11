import { commissionBase, commissionCents } from './commission-base';

const sale = (id: string, totalCents: number, items: Array<[number, string | null]> = []) => ({
  id, totalCents, items: items.map(([c, s]) => ({ totalCents: c, staffId: s })),
});

describe('commissionBase', () => {
  it('credits the cashier for the whole sale when no line names anyone (as before)', () => {
    expect(commissionBase([sale('s1', 10000, [[6000, null], [4000, null]]), sale('s2', 5000)], [])).toEqual({ valueCents: 15000, count: 2 });
  });

  it('credits the stylist, not the cashier, for a line that names the stylist (the bug)', () => {
    // reception (cashier) rang up a KES 3,000 colour done by stylist A
    const receptionist = commissionBase([sale('s1', 3000, [[3000, 'A']])], []);
    expect(receptionist).toEqual({ valueCents: 0, count: 0 });
    const stylist = commissionBase([], [{ saleId: 's1', totalCents: 3000 }]);
    expect(stylist).toEqual({ valueCents: 3000, count: 1 });
  });

  it('splits one visit between two stylists, and leaves unnamed lines (a product) with the cashier', () => {
    const s = sale('s1', 10000, [[4000, 'A'], [5000, 'B'], [1000, null]]);
    expect(commissionBase([s], [])).toEqual({ valueCents: 1000, count: 1 });
    expect(commissionBase([], [{ saleId: 's1', totalCents: 4000 }])).toEqual({ valueCents: 4000, count: 1 });
    expect(commissionBase([], [{ saleId: 's1', totalCents: 5000 }])).toEqual({ valueCents: 5000, count: 1 });
  });

  it('never counts a line twice for someone who was both cashier and stylist', () => {
    const s = sale('s1', 8000, [[5000, 'A'], [3000, null]]);
    // A is the cashier AND the stylist of the 5,000 line: the cashier part is only the unnamed 3,000, the served part the 5,000
    expect(commissionBase([s], [{ saleId: 's1', totalCents: 5000 }])).toEqual({ valueCents: 8000, count: 2 });
  });

  it('counts a sale once for a stylist who did two of its lines', () => {
    expect(commissionBase([], [{ saleId: 's1', totalCents: 2000 }, { saleId: 's1', totalCents: 1500 }, { saleId: 's2', totalCents: 500 }])).toEqual({ valueCents: 4000, count: 2 });
  });

  it('copes with a sale that carries no item list', () => {
    expect(commissionBase([{ id: 's', totalCents: 700 } as any], [])).toEqual({ valueCents: 700, count: 1 });
  });
});

describe('commissionCents', () => {
  it('a percentage of the value, or a flat amount per sale', () => {
    expect(commissionCents('SALES_VALUE', 10, { valueCents: 15000, count: 2 })).toBe(1500);
    expect(commissionCents('TRANSACTION_COUNT', 50, { valueCents: 15000, count: 2 })).toBe(10000);
  });

  it('earns nothing for a basis that is not worked out yet', () => {
    expect(commissionCents('GROSS_MARGIN', 10, { valueCents: 15000, count: 2 })).toBe(0);
    expect(commissionCents(undefined, 10, { valueCents: 15000, count: 2 })).toBe(0);
  });
});
