import {
  percentChange, sharePct, avgSaleCents, rankStores, groupTotals, groupTopItems,
  rollupRange, PERIOD_LABELS, type StoreStat, type RollupPeriod,
} from '../lib/rollup';

const store = (over: Partial<StoreStat> = {}): StoreStat => ({
  storeId: 's1', storeName: 'CBD', storeCode: 'NRB01',
  totalRevenueCents: 100_000, totalVatCents: 13_793, transactionCount: 10,
  topItems: [], totalStockLines: 40, ...over,
});

describe('percentChange', () => {
  it('computes growth and decline to one decimal', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(75, 100)).toBe(-25);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(133, 100)).toBe(33);
  });

  // Zero baseline is a new/silent branch, not infinite growth — showing +∞% or
  // a made-up +100% would mislead an owner.
  it('returns null when there is no baseline to compare against', () => {
    expect(percentChange(500, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe('sharePct', () => {
  it('reports a share of the group', () => {
    expect(sharePct(25, 100)).toBe(25);
    expect(sharePct(1, 3)).toBe(33.3);
  });

  it('is zero when the group took nothing, instead of dividing by zero', () => {
    expect(sharePct(0, 0)).toBe(0);
    expect(sharePct(10, 0)).toBe(0);
  });
});

describe('avgSaleCents', () => {
  it('divides revenue by transactions', () => {
    expect(avgSaleCents(100_000, 10)).toBe(10_000);
  });

  it('is zero when nothing sold, rather than NaN', () => {
    expect(avgSaleCents(0, 0)).toBe(0);
    expect(avgSaleCents(500, 0)).toBe(0);
  });
});

describe('rankStores', () => {
  const current = [
    store({ storeId: 'a', storeName: 'A', totalRevenueCents: 30_000, transactionCount: 3 }),
    store({ storeId: 'b', storeName: 'B', totalRevenueCents: 70_000, transactionCount: 7 }),
  ];

  it('orders by revenue, richest first, and numbers the ranks', () => {
    const ranked = rankStores(current);
    expect(ranked.map((r) => r.storeId)).toEqual(['b', 'a']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('computes each branch share of the group', () => {
    const ranked = rankStores(current);
    expect(ranked[0].sharePct).toBe(70);
    expect(ranked[1].sharePct).toBe(30);
  });

  it('annotates change only for stores present in the previous period', () => {
    const previous = [store({ storeId: 'b', totalRevenueCents: 35_000 })];
    const ranked = rankStores(current, previous);
    expect(ranked.find((r) => r.storeId === 'b')!.changePct).toBe(100);
    expect(ranked.find((r) => r.storeId === 'a')!.changePct).toBeNull();
  });

  // The current period defines the list: a branch that closed should drop off,
  // not linger at zero revenue.
  it('does not resurrect stores that only exist in the previous period', () => {
    const ranked = rankStores(current, [store({ storeId: 'gone' })]);
    expect(ranked.map((r) => r.storeId)).toEqual(['b', 'a']);
  });

  it('handles missing input without throwing', () => {
    expect(rankStores(undefined)).toEqual([]);
    expect(rankStores([], undefined)).toEqual([]);
  });

  it('does not mutate the array it was given', () => {
    const input = [...current];
    rankStores(input);
    expect(input.map((r) => r.storeId)).toEqual(['a', 'b']);
  });
});

describe('groupTotals', () => {
  it('sums revenue, transactions and VAT across branches', () => {
    const totals = groupTotals([
      store({ storeId: 'a', totalRevenueCents: 30_000, transactionCount: 3, totalVatCents: 4_000 }),
      store({ storeId: 'b', totalRevenueCents: 70_000, transactionCount: 7, totalVatCents: 9_000 }),
    ]);
    expect(totals.totalRevenueCents).toBe(100_000);
    expect(totals.totalTransactions).toBe(10);
    expect(totals.totalVatCents).toBe(13_000);
    expect(totals.storeCount).toBe(2);
    expect(totals.avgSaleCents).toBe(10_000);
  });

  it('counts branches that took nothing', () => {
    const totals = groupTotals([
      store({ storeId: 'a', totalRevenueCents: 0, transactionCount: 0 }),
      store({ storeId: 'b' }),
    ]);
    expect(totals.silentStores).toBe(1);
  });

  it('is all zeroes for no stores', () => {
    const totals = groupTotals(undefined);
    expect(totals.totalRevenueCents).toBe(0);
    expect(totals.storeCount).toBe(0);
    expect(totals.avgSaleCents).toBe(0);
  });
});

describe('groupTopItems', () => {
  // itemId differs per branch when a product is stocked separately, so the merge
  // has to key on name or the same product appears once per store.
  it('merges the same product across branches by name', () => {
    const merged = groupTopItems([
      store({ storeId: 'a', topItems: [{ itemId: 'i-a', name: 'Chapati', qtySold: 10, revenueCents: 5_000 }] }),
      store({ storeId: 'b', topItems: [{ itemId: 'i-b', name: 'Chapati', qtySold: 5, revenueCents: 2_500 }] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Chapati', qtySold: 15, revenueCents: 7_500 });
  });

  it('orders by revenue and respects the limit', () => {
    const merged = groupTopItems([
      store({
        topItems: [
          { itemId: '1', name: 'Soda', qtySold: 1, revenueCents: 100 },
          { itemId: '2', name: 'Ugali', qtySold: 1, revenueCents: 900 },
          { itemId: '3', name: 'Tea', qtySold: 1, revenueCents: 500 },
        ],
      }),
    ], 2);
    expect(merged.map((i) => i.name)).toEqual(['Ugali', 'Tea']);
  });

  it('returns nothing when no branch reported items', () => {
    expect(groupTopItems([store()])).toEqual([]);
    expect(groupTopItems(undefined)).toEqual([]);
  });
});

describe('rollupRange', () => {
  const now = new Date('2026-08-13T15:30:00');

  it('spans the local day for today', () => {
    const { start, end } = rollupRange('today', now);
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(13);
    expect(end.getHours()).toBe(23);
    expect(end.getDate()).toBe(13);
  });

  it('spans seven days inclusive for the week', () => {
    const { start, end } = rollupRange('week', now);
    expect(start.getDate()).toBe(7);
    expect(end.getDate()).toBe(13);
  });

  it('starts on the 1st for the month', () => {
    expect(rollupRange('month', now).start.getDate()).toBe(1);
  });

  // The comparison window must not overlap the current one, or a store's growth
  // would be measured partly against itself.
  it('puts the previous window strictly before the current one', () => {
    for (const p of ['today', 'week', 'month'] as RollupPeriod[]) {
      const { start, prevEnd, prevStart } = rollupRange(p, now);
      expect(prevEnd.getTime()).toBeLessThan(start.getTime());
      expect(prevStart.getTime()).toBeLessThanOrEqual(prevEnd.getTime());
    }
  });

  it('labels every period', () => {
    for (const p of ['today', 'week', 'month'] as RollupPeriod[]) {
      expect(PERIOD_LABELS[p].length).toBeGreaterThan(0);
    }
  });
});
