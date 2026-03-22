import { BadRequestException } from '@nestjs/common';
import { BatchService } from './batch.service';

function makeBatch(overrides: Record<string, any> = {}) {
  return {
    id: 'batch-1', businessId: 'biz-1', itemId: 'item-1', batchNumber: 'BN001', quantityReceived: 100, quantityRemaining: 80,
    costPriceCents: 5000, expiryDate: new Date(Date.now() + 30 * 86400000), isRecalled: false, movements: [], ...overrides,
  };
}

function makeItem(overrides: Record<string, any> = {}) {
  return { id: 'item-1', businessId: 'biz-1', trackBatches: true, ...overrides };
}

function makePrisma() {
  return {
    batch: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    item: { findFirst: jest.fn() },
    inventoryMovement: { count: jest.fn().mockResolvedValue(0), create: jest.fn() },
  };
}

function makeNotifications() {
  return { notifyBatchRecall: jest.fn().mockResolvedValue(undefined) };
}

function makeInventory() {
  return { createMovement: jest.fn().mockResolvedValue(undefined) };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const notifications = makeNotifications();
  const inventory = makeInventory();
  const svc = new BatchService(prisma, notifications as any);
  return { svc, prisma, notifications };
}

describe('BatchService', () => {
  describe('create', () => {
    it('creates a batch for a batch-tracked item', async () => {
      const batch = makeBatch();
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(makeItem());
      prisma.batch.create.mockResolvedValue(batch);
      const dto: any = { itemId: 'item-1', batchNumber: 'BN001', quantityReceived: 100, quantityRemaining: 100, costPriceCents: 5000, expiryDate: new Date() };
      await svc.create('biz-1', dto);
      expect(prisma.batch.create).toHaveBeenCalledTimes(1);
    });

    it('throws if item does not track batches', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(makeItem({ trackBatches: false }));
      await expect(svc.create('biz-1', { itemId: 'item-1' } as any)).rejects.toThrow(BadRequestException);
    });

    it('throws if item not found', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(svc.create('biz-1', { itemId: 'bad' } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listBatches', () => {
    it('returns batches for businessId', async () => {
      const { svc, prisma } = makeService();
      prisma.batch.findMany.mockResolvedValue([makeBatch()]);
      const result = await svc.listBatches('biz-1');
      expect(result).toHaveLength(1);
      const where = prisma.batch.findMany.mock.calls[0][0].where;
      expect(where.item).toEqual({ businessId: 'biz-1' });
    });

    it('filters by status when provided', async () => {
      const { svc, prisma } = makeService();
      prisma.batch.findMany.mockResolvedValue([]);
      await svc.listBatches('biz-1', 'ACTIVE');
      const where = prisma.batch.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('ACTIVE');
    });
  });

  describe('getExpiringBatches', () => {
    it('returns batches expiring within threshold days', async () => {
      const { svc, prisma } = makeService();
      prisma.batch.findMany.mockResolvedValue([makeBatch()]);
      const result = await svc.getExpiringBatches('biz-1', 30);
      expect(result).toHaveLength(1);
      const where = prisma.batch.findMany.mock.calls[0][0].where;
      expect(where.expiryDate).toBeDefined();
    });
  });

  describe('recallBatch', () => {
    it('marks batch as recalled and notifies', async () => {
      const batch = makeBatch({ movements: [{ sale: { id: 'sale-1' } }], item: { businessId: 'biz-1', name: 'Milk' } });
      const { svc, prisma, notifications } = makeService();
      prisma.batch.findFirst.mockResolvedValue(batch);
      prisma.batch.update.mockResolvedValue({ ...batch, isRecalled: true });
      prisma.inventoryMovement.count.mockResolvedValue(1);
      await svc.recallBatch('batch-1', 'biz-1');
      expect(prisma.batch.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: 'RECALLED' }),
      }));
      expect(notifications.notifyBatchRecall).toHaveBeenCalled();
    });

    it('throws if batch not found', async () => {
      const { svc, prisma } = makeService();
      prisma.batch.findFirst.mockResolvedValue(null);
      await expect(svc.recallBatch('bad', 'biz-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getBatchesFEFO', () => {
    it('returns batches ordered by expiryDate ascending (FEFO)', async () => {
      const { svc, prisma } = makeService();
      prisma.batch.findMany.mockResolvedValue([makeBatch()]);
      await svc.getBatchesFEFO('item-1');
      const orderBy = prisma.batch.findMany.mock.calls[0][0].orderBy;
      expect(orderBy.expiryDate).toBe('asc');
    });
  });
});
