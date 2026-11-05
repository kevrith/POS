import { BadRequestException } from '@nestjs/common';
import { ItemsService } from './items.service';

function setup() {
  const prisma: any = {
    item: {
      findFirst: jest.fn().mockResolvedValue({ id: 'i1', businessId: 'biz-1', name: 'Flour', barcode: null }),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'new', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'i1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1', businessId: 'biz-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'store-1', businessId: 'biz-1' }) },
    category: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    $transaction: jest.fn(async (fn: any) => (typeof fn === 'function' ? fn(prisma) : Promise.all(fn))),
  };
  return { prisma, svc: new ItemsService(prisma, { createMovement: jest.fn() } as any) };
}

const NEW = { name: 'Flour', type: 'PRODUCT', retailPriceCents: 20_000, trackStock: true, storeId: 'store-1', businessId: 'biz-1' } as any;

describe('item tax class on create', () => {
  it('defaults to standard-rated', async () => {
    const { svc, prisma } = setup();
    await svc.create(NEW);
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'B', vatApplicable: true }));
  });

  it('keeps the chosen class, and the older flag in step with it', async () => {
    const { svc, prisma } = setup();
    await svc.create({ ...NEW, taxClass: 'A' });
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'A', vatApplicable: false }));
    await svc.create({ ...NEW, taxClass: 'C' });
    expect(prisma.item.create.mock.calls[1][0].data).toEqual(expect.objectContaining({ taxClass: 'C', vatApplicable: false }));
  });

  it('an older client sending only vatApplicable: false does NOT create an exempt item (its form defaulted to false)', async () => {
    const { svc, prisma } = setup();
    await svc.create({ ...NEW, vatApplicable: false });
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'B', vatApplicable: true }));
  });

  it('an explicit class wins over the older flag', async () => {
    const { svc, prisma } = setup();
    await svc.create({ ...NEW, taxClass: 'B', vatApplicable: false });
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'B', vatApplicable: true }));
  });

  it('rejects a class that does not exist', async () => {
    const { svc, prisma } = setup();
    await expect(svc.create({ ...NEW, taxClass: 'E' })).rejects.toThrow(BadRequestException);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });
});

describe('item tax class on update', () => {
  it('changes the class and keeps the flag in step', async () => {
    const { svc, prisma } = setup();
    await svc.update('i1', 'biz-1', { taxClass: 'A' } as any);
    expect(prisma.item.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'A', vatApplicable: false }));
  });

  it('leaves tax alone when the request does not mention it', async () => {
    const { svc, prisma } = setup();
    await svc.update('i1', 'biz-1', { retailPriceCents: 25_000 } as any);
    const data = prisma.item.update.mock.calls[0][0].data;
    expect('taxClass' in data).toBe(false);
    expect(data.vatApplicable).toBeUndefined();
  });

  it('an older client\'s vatApplicable on an edit changes nothing about tax', async () => {
    const { svc, prisma } = setup();
    await svc.update('i1', 'biz-1', { vatApplicable: false, retailPriceCents: 1 } as any);
    const data = prisma.item.update.mock.calls[0][0].data;
    expect('taxClass' in data).toBe(false);
    expect(data.vatApplicable).toBeUndefined();
  });
});

describe('bulk tax class', () => {
  it('sets the class on the business\'s own items only', async () => {
    const { svc, prisma } = setup();
    const r = await svc.setTaxClass('biz-1', ['a', 'b', 'c'], 'A');
    expect(r).toEqual({ updated: 3, taxClass: 'A' });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b', 'c'] }, businessId: 'biz-1', deletedAt: null },
      data: { taxClass: 'A', vatApplicable: false },
    });
  });

  it('rejects a bad class, no items, too many items and non-id entries', async () => {
    const { svc, prisma } = setup();
    await expect(svc.setTaxClass('biz-1', ['a'], 'Z')).rejects.toThrow(/Tax class/);
    await expect(svc.setTaxClass('biz-1', [], 'A')).rejects.toThrow(/at least one/);
    await expect(svc.setTaxClass('biz-1', 'a' as any, 'A')).rejects.toThrow(BadRequestException);
    await expect(svc.setTaxClass('biz-1', Array.from({ length: 2001 }, (_, i) => `i${i}`), 'A')).rejects.toThrow(/2,000/);
    await expect(svc.setTaxClass('biz-1', ['a', 5 as any], 'A')).rejects.toThrow(/ids/);
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });
});

describe('CSV import tax class', () => {
  it('reads the class from a column, by letter or word, and rejects nonsense', async () => {
    const { svc, prisma } = setup();
    prisma.item.findFirst.mockResolvedValue(null);
    const res = await svc.importFromCsv('biz-1', 'store-1', [
      { name: 'Flour', retailPrice: 200, taxClass: 'exempt' },
      { name: 'Milk', retailPrice: 100 },
      { name: 'Odd', retailPrice: 100, taxClass: 'maybe' },
    ]);
    expect(res.results.map((r) => r.success)).toEqual([true, true, false]);
    expect(res.imported).toBe(2);
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ taxClass: 'A', vatApplicable: false }));
    expect(prisma.item.create.mock.calls[1][0].data).toEqual(expect.objectContaining({ taxClass: 'B', vatApplicable: true }));
    expect(res.results[2].error).toMatch(/Tax class "maybe"/);
  });
});
