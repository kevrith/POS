import { BadRequestException } from '@nestjs/common';
import { drawStock, restoreStock } from './batch-allocation';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86400000);

interface B { id: string; itemId: string; storeId: string; status: string; quantityRemaining: number; expiryDate: Date | null; item?: { businessId: string } }
interface M { itemId: string; storeId: string; businessId: string; type: string; quantity: number; saleId?: string; batchId?: string; createdAt: number }

/** Just enough of the two tables for the allocation code to run against. */
function fakeTx(batches: B[], movements: M[] = []) {
  let clock = 0;
  const gte = (v: any, w: any) => (w === undefined ? true : typeof w === 'number' ? v === w : (w.gte === undefined || v >= w.gte) && (w.gt === undefined || v > w.gt));
  const matchBatch = (b: B, where: any) =>
    (where.id === undefined || b.id === where.id) &&
    (where.itemId === undefined || b.itemId === where.itemId) &&
    (where.storeId === undefined || b.storeId === where.storeId) &&
    (where.status === undefined || (typeof where.status === 'string' ? b.status === where.status : !where.status.notIn.includes(b.status))) &&
    gte(b.quantityRemaining, where.quantityRemaining);
  const tx: any = {
    batch: {
      findMany: jest.fn(async ({ where, orderBy }: any) => {
        const rows = batches.filter((b) => matchBatch(b, where));
        if (orderBy?.expiryDate === 'asc') rows.sort((x, y) => (x.expiryDate?.getTime() ?? Infinity) - (y.expiryDate?.getTime() ?? Infinity));
        return rows.map((b) => ({ ...b }));
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        const b = batches.find((x) => matchBatch(x, where));
        return b ? { ...b } : null;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const hit = batches.filter((b) => matchBatch(b, where));
        for (const b of hit) {
          if (data.quantityRemaining?.decrement !== undefined) b.quantityRemaining = Math.round((b.quantityRemaining - data.quantityRemaining.decrement) * 1e6) / 1e6;
          if (data.quantityRemaining?.increment !== undefined) b.quantityRemaining = Math.round((b.quantityRemaining + data.quantityRemaining.increment) * 1e6) / 1e6;
        }
        return { count: hit.length };
      }),
    },
    inventoryMovement: {
      create: jest.fn(async ({ data }: any) => { movements.push({ ...data, createdAt: ++clock }); return data; }),
      findMany: jest.fn(async ({ where }: any) =>
        movements
          .filter((m) => m.saleId === where.saleId && m.itemId === where.itemId && m.batchId !== undefined && m.batchId !== null)
          .sort((a, b) => b.createdAt - a.createdAt),
      ),
      aggregate: jest.fn(async ({ where }: any) => ({
        _sum: { quantity: movements.filter((m) => m.itemId === where.itemId && m.storeId === where.storeId).reduce((s, m) => s + m.quantity, 0) },
      })),
    },
  };
  return { tx, batches, movements };
}

const batch = (id: string, qty: number, expiryDate: Date | null, o: Partial<B> = {}): B =>
  ({ id, itemId: 'item-1', storeId: 'store-1', status: 'ACTIVE', quantityRemaining: qty, expiryDate, item: { businessId: 'biz-1' }, ...o });
const ledger = (qty: number, o: Partial<M> = {}): M =>
  ({ itemId: 'item-1', storeId: 'store-1', businessId: 'biz-1', type: 'INITIAL', quantity: qty, createdAt: 0, ...o });
const base = { businessId: 'biz-1', storeId: 'store-1', itemId: 'item-1', itemName: 'Yoghurt', saleId: 'sale-1' };
const draw = (tx: any, quantity: number, trackBatches = true) => drawStock(tx, { ...base, quantity, trackBatches, now: NOW });

describe('drawStock', () => {
  it('writes one plain movement for an item that does not track batches', async () => {
    const { tx, movements } = fakeTx([]);
    await draw(tx, 3, false);
    expect(movements).toEqual([expect.objectContaining({ type: 'SALE', quantity: -3, batchId: undefined, saleId: 'sale-1' })]);
    expect(tx.batch.findMany).not.toHaveBeenCalled();
  });

  it('sells the soonest-expiring batch first and records which batch each unit came from', async () => {
    const { tx, batches, movements } = fakeTx([batch('late', 10, days(60)), batch('soon', 4, days(5)), batch('mid', 10, days(20))]);
    await draw(tx, 6);
    expect(batches.find((b) => b.id === 'soon')!.quantityRemaining).toBe(0);
    expect(batches.find((b) => b.id === 'mid')!.quantityRemaining).toBe(8);
    expect(batches.find((b) => b.id === 'late')!.quantityRemaining).toBe(10);
    expect(movements.map((m) => [m.batchId, m.quantity])).toEqual([['soon', -4], ['mid', -2]]);
  });

  it('sells a batch with no expiry date last', async () => {
    const { tx, movements } = fakeTx([batch('none', 5, null), batch('dated', 5, days(90))]);
    await draw(tx, 3);
    expect(movements.map((m) => m.batchId)).toEqual(['dated']);
  });

  it('never draws from an expired batch', async () => {
    const { tx, batches, movements } = fakeTx([batch('old', 5, days(-3)), batch('fresh', 5, days(30))], [ledger(10)]);
    await draw(tx, 4);
    expect(batches.find((b) => b.id === 'old')!.quantityRemaining).toBe(5);
    expect(movements.filter((m) => m.type === 'SALE').map((m) => m.batchId)).toEqual(['fresh']);
  });

  it('refuses when what is left is the expired batch', async () => {
    const { tx, batches, movements } = fakeTx([batch('old', 5, days(-3))], [ledger(5)]);
    await expect(draw(tx, 2)).rejects.toThrow(/only expired stock is left/);
    expect(batches[0].quantityRemaining).toBe(5);
    expect(movements.filter((m) => m.type === 'SALE')).toHaveLength(0);
  });

  it('still sells stock that was never put in a batch, even beside an expired batch', async () => {
    // 12 on the shelf: 5 are the expired batch, 7 were received without batch records.
    const { tx, movements } = fakeTx([batch('old', 5, days(-3))], [ledger(12)]);
    await draw(tx, 7);
    expect(movements.filter((m) => m.type === 'SALE')).toEqual([expect.objectContaining({ quantity: -7, batchId: undefined })]);
    await expect(draw(tx, 1)).rejects.toThrow(/only expired stock/);
  });

  it('takes the part batches cannot cover as an unbatched movement', async () => {
    const { tx, movements } = fakeTx([batch('a', 3, days(10))]);
    const r = await draw(tx, 5);
    expect(r.unbatched).toBe(2);
    expect(movements.map((m) => [m.batchId, m.quantity])).toEqual([['a', -3], [undefined, -2]]);
  });

  it('handles fractions exactly to the gram', async () => {
    const { tx, batches, movements } = fakeTx([batch('a', 2.5, days(10))]);
    await draw(tx, 0.75);
    await draw(tx, 0.1);
    await draw(tx, 0.2);
    expect(batches[0].quantityRemaining).toBe(1.45);
    expect(movements.map((m) => m.quantity)).toEqual([-0.75, -0.1, -0.2]);
  });

  it('claims with a condition so a competing sale cannot take the same units', async () => {
    const { tx } = fakeTx([batch('a', 5, days(10))]);
    await draw(tx, 2);
    expect(tx.batch.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', status: 'ACTIVE', quantityRemaining: { gte: 2 } },
      data: { quantityRemaining: { decrement: 2 } },
    });
  });

  it('recovers when another sale took units between the read and the claim', async () => {
    const { tx, batches, movements } = fakeTx([batch('a', 5, days(10))]);
    const real = tx.batch.updateMany.getMockImplementation()!;
    // The first claim loses: someone else drops the batch to 1 unit just before it lands.
    tx.batch.updateMany.mockImplementationOnce(async () => { batches[0].quantityRemaining = 1; return { count: 0 }; });
    const r = await draw(tx, 4);
    expect(batches[0].quantityRemaining).toBe(0);
    expect(movements.map((m) => [m.batchId, m.quantity])).toEqual([['a', -1], [undefined, -3]]);
    expect(r.unbatched).toBe(3);
    expect(real).toBeDefined();
  });

  it('only looks at the caller\'s own business, store and item', async () => {
    const { tx } = fakeTx([]);
    await draw(tx, 1);
    expect(tx.batch.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ itemId: 'item-1', storeId: 'store-1', status: 'ACTIVE', item: { businessId: 'biz-1' } }));
  });

  it('does nothing for a zero or negative quantity', async () => {
    const { tx, movements } = fakeTx([batch('a', 5, days(10))]);
    await draw(tx, 0);
    await draw(tx, -2);
    expect(movements).toHaveLength(0);
  });
});

describe('restoreStock', () => {
  const restore = (tx: any, quantity: number, type = 'VOID') => restoreStock(tx, { ...base, saleId: 'sale-1', quantity, type });

  it('puts units back into the batches the sale took them from', async () => {
    const { tx, batches, movements } = fakeTx([batch('soon', 4, days(5)), batch('mid', 10, days(20))]);
    await draw(tx, 6); // soon -4, mid -2
    await restore(tx, 6);
    expect(batches.find((b) => b.id === 'soon')!.quantityRemaining).toBe(4);
    expect(batches.find((b) => b.id === 'mid')!.quantityRemaining).toBe(10);
    const back = movements.filter((m) => m.type === 'VOID');
    expect(back.reduce((s, m) => s + m.quantity, 0)).toBe(6);
    expect(back.every((m) => m.batchId)).toBe(true);
  });

  it('a partial restore refills the most recent draw first and cannot exceed what was sold', async () => {
    const { tx, batches } = fakeTx([batch('soon', 4, days(5)), batch('mid', 10, days(20))]);
    await draw(tx, 6);
    await restore(tx, 1);
    expect(batches.find((b) => b.id === 'mid')!.quantityRemaining).toBe(9);
    const r = await restore(tx, 50);
    // Only the 5 still out can go back to batches; the rest is unbatched.
    expect(r.slices.reduce((s, x) => s + x.quantity, 0)).toBe(5);
    expect(r.unbatched).toBe(45);
  });

  it('does not restore the same units twice across a void and a later return', async () => {
    const { tx, batches } = fakeTx([batch('a', 10, days(10))]);
    await draw(tx, 4);
    await restore(tx, 4, 'VOID');
    expect(batches[0].quantityRemaining).toBe(10);
    const again = await restore(tx, 4, 'RETURN');
    expect(batches[0].quantityRemaining).toBe(10);
    expect(again.unbatched).toBe(4);
  });

  it('returns units to stock unbatched when their batch was written off', async () => {
    const { tx, batches, movements } = fakeTx([batch('a', 5, days(10))]);
    await draw(tx, 2);
    batches[0].status = 'WRITTEN_OFF';
    const r = await restore(tx, 2);
    expect(batches[0].quantityRemaining).toBe(3);
    expect(r.slices).toEqual([]);
    expect(movements[movements.length - 1]).toEqual(expect.objectContaining({ type: 'VOID', quantity: 2, batchId: undefined }));
  });

  it('a sale made before batches were wired in restores as one plain movement', async () => {
    const { tx, movements } = fakeTx([], [ledger(-3, { type: 'SALE', saleId: 'sale-1' })]);
    await restore(tx, 3, 'RETURN');
    expect(movements[movements.length - 1]).toEqual(expect.objectContaining({ type: 'RETURN', quantity: 3, batchId: undefined }));
  });

  it('restores fractions exactly', async () => {
    const { tx, batches } = fakeTx([batch('a', 2.5, days(10))]);
    await draw(tx, 0.5);
    await restore(tx, 0.5);
    expect(batches[0].quantityRemaining).toBe(2.5);
  });

  it('is a no-op for nothing to restore', async () => {
    const { tx, movements } = fakeTx([]);
    await restore(tx, 0);
    expect(movements).toHaveLength(0);
    expect(BadRequestException).toBeDefined();
  });
});
