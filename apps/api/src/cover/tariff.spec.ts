import { applyTariff, loadTariff } from './tariff';

const lines = [
  { itemId: 'consult', name: 'Consultation', quantity: 1, unitPriceCents: 50000 },
  { itemId: 'lab', name: 'Malaria test', quantity: 2, unitPriceCents: 30000 },
  { itemId: 'dress', name: 'Dressing', quantity: 1, unitPriceCents: 10000 },
];

describe('applyTariff', () => {
  it('reprices the items the insurer has a price for, and leaves the rest at list', () => {
    const r = applyTariff(lines, new Map([['consult', 40000], ['lab', 25000]]));
    expect(r.lines.map((l) => [l.itemId, l.unitPriceCents, l.listUnitPriceCents, l.onTariff])).toEqual([['consult', 40000, 50000, true], ['lab', 25000, 30000, true], ['dress', 10000, 10000, false]]);
    expect(r.listTotalCents).toBe(120000);
    expect(r.billTotalCents).toBe(100000);
  });
  it('an insurer with no tariff, or a price equal to the list, changes nothing', () => {
    expect(applyTariff(lines, new Map()).billTotalCents).toBe(120000);
    const same = applyTariff(lines, new Map([['consult', 50000]]));
    expect(same.billTotalCents).toBe(120000);
    expect(same.lines[0].onTariff).toBe(false);
  });
  it('a tariff may be higher than the list price', () => {
    expect(applyTariff(lines, new Map([['dress', 15000]])).billTotalCents).toBe(125000);
  });
  it('rounds each line to whole cents', () => {
    expect(applyTariff([{ itemId: 'x', name: 'x', quantity: 0.333, unitPriceCents: 100 }], new Map([['x', 101]])).billTotalCents).toBe(34);
  });
});

describe('loadTariff', () => {
  it('is scoped to the business and the insurer', async () => {
    const db: any = { insurerTariff: { findMany: jest.fn().mockResolvedValue([{ itemId: 'a', priceCents: 5 }]) } };
    expect(await loadTariff(db, 'biz-1', 'sha')).toEqual(new Map([['a', 5]]));
    expect(db.insurerTariff.findMany).toHaveBeenCalledWith({ where: { businessId: 'biz-1', providerId: 'sha' }, select: { itemId: true, priceCents: true } });
  });
});
