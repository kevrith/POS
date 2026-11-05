import { BadRequestException } from '@nestjs/common';
import { assertStockAvailable, blocksOversell, sellsInFractions, type StockGuardTx } from './stock-guard';

function fakeTx(stock: Record<string, number>) {
  const calls: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async () => { calls.push('lock'); return []; }),
    inventoryMovement: {
      aggregate: jest.fn(async (args: any) => { calls.push('read:' + args.where.itemId); return { _sum: { quantity: stock[args.where.itemId] ?? null } }; }),
    },
  };
  return { tx: tx as unknown as StockGuardTx, calls };
}

describe('blocksOversell', () => {
  it('blocks when the item says BLOCK', () => expect(blocksOversell({ negativeStockPolicy: 'BLOCK' }, 'ALLOW')).toBe(true));
  it('blocks when the business says BLOCK, whatever the item was saved with', () => {
    expect(blocksOversell({ negativeStockPolicy: 'ALLOW' }, 'BLOCK')).toBe(true);
    expect(blocksOversell({ negativeStockPolicy: null }, 'BLOCK')).toBe(true);
  });
  it('does not block on WARN or ALLOW', () => {
    expect(blocksOversell({ negativeStockPolicy: 'ALLOW' }, 'WARN')).toBe(false);
    expect(blocksOversell({}, undefined)).toBe(false);
  });
});

describe('assertStockAvailable', () => {
  const base = { businessId: 'b', storeId: 's' };

  it('passes when the shelf covers the cart, down to the last unit', async () => {
    const { tx } = fakeTx({ a: 5 });
    await expect(assertStockAvailable(tx, { ...base, lines: [{ itemId: 'a', name: 'A', quantity: 5 }] })).resolves.toBeUndefined();
  });

  it('refuses more than is on hand and says how much there is', async () => {
    const { tx } = fakeTx({ a: 4 });
    await expect(assertStockAvailable(tx, { ...base, lines: [{ itemId: 'a', name: 'A', quantity: 5 }] }))
      .rejects.toThrow('Insufficient stock for A. Available: 4, needed: 5');
  });

  it('treats an item with no movements as zero stock', async () => {
    const { tx } = fakeTx({});
    await expect(assertStockAvailable(tx, { ...base, lines: [{ itemId: 'a', name: 'A', quantity: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds up two lines of the same item before comparing', async () => {
    const { tx } = fakeTx({ a: 5 });
    await expect(assertStockAvailable(tx, { ...base, lines: [{ itemId: 'a', name: 'A', quantity: 3 }, { itemId: 'a', name: 'A', quantity: 3 }] }))
      .rejects.toThrow('needed: 6');
  });

  it('handles fractional quantities without floating-point crumbs', async () => {
    const { tx } = fakeTx({ a: 0.3 });
    await expect(assertStockAvailable(tx, { ...base, lines: [{ itemId: 'a', name: 'A', quantity: 0.1 + 0.2 }] })).resolves.toBeUndefined();
  });

  it('locks the item rows before it reads any stock, in id order', async () => {
    const { tx, calls } = fakeTx({ a: 9, b: 9 });
    await assertStockAvailable(tx, { ...base, lines: [{ itemId: 'b', name: 'B', quantity: 1 }, { itemId: 'a', name: 'A', quantity: 1 }] });
    expect(calls).toEqual(['lock', 'read:a', 'read:b']);
  });

  it('does nothing for an empty list', async () => {
    const { tx, calls } = fakeTx({});
    await assertStockAvailable(tx, { ...base, lines: [] });
    expect(calls).toEqual([]);
  });
});

describe('sellsInFractions', () => {
  it('is false for a plain product and the other by-the-piece types', () => {
    for (const type of ['PRODUCT', 'BUNDLE', 'RECIPE', undefined]) expect(sellsInFractions({ type })).toBe(false);
  });
  it('is true for weighed and fractional items', () => {
    expect(sellsInFractions({ type: 'WEIGHTED' })).toBe(true);
    expect(sellsInFractions({ type: 'PRODUCT', isFractional: true })).toBe(true);
    expect(sellsInFractions({ type: 'PRODUCT', isWeighed: true })).toBe(true);
  });
  it('is true for services, which are timed rather than counted', () => expect(sellsInFractions({ type: 'SERVICE' })).toBe(true));
});
