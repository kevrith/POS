import { NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';

function makeItem(overrides: Record<string, any> = {}) {
  return { id: 'item-1', businessId: 'biz-1', name: 'Cappuccino', barcode: 'CAP001', category: 'Coffee', retailPriceCents: 50000, trackStock: true, soldOut: false, isActive: true, deletedAt: null, offlineId: 'uuid-1', ...overrides };
}

function makePrisma() {
  return {
    item: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    inventoryMovement: { aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 10 } }), groupBy: jest.fn().mockResolvedValue([]) },
  };
}

function makeInventory() {
  return { createMovement: jest.fn().mockResolvedValue(undefined), getStockLevels: jest.fn().mockResolvedValue(new Map()) };
}

function makeService(prismaOverrides = {}) {
  const prisma: any = { ...makePrisma(), ...prismaOverrides };
  const inventory = makeInventory();
  const svc = new ItemsService(prisma, inventory as any);
  return { svc, prisma, inventory };
}

describe('ItemsService', () => {
  describe('findAll', () => {
    it('returns items with currentStock merged in', async () => {
      const item = makeItem();
      const stockMap = new Map([['item-1', 5]]);
      const { svc, prisma, inventory } = makeService();
      prisma.item.findMany.mockResolvedValue([item]);
      inventory.getStockLevels.mockResolvedValue(stockMap);
      const result = await svc.findAll('biz-1', 'store-1');
      expect(result[0].currentStock).toBe(5);
    });

    it('passes search to prisma as case-insensitive OR clause', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findMany.mockResolvedValue([]);
      await svc.findAll('biz-1', undefined, 'cap');
      const where = prisma.item.findMany.mock.calls[0][0].where;
      expect(where.OR).toBeDefined();
      expect(where.OR[0].name.mode).toBe('insensitive');
    });

    it('filters activeOnly when flag is set', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findMany.mockResolvedValue([]);
      await svc.findAll('biz-1', undefined, undefined, true);
      const where = prisma.item.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBe(true);
    });
  });

  describe('findOne', () => {
    it('returns item when found', async () => {
      const item = makeItem();
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(item);
      const result = await svc.findOne('item-1', 'biz-1');
      expect(result.id).toBe('item-1');
    });

    it('throws NotFoundException for unknown id', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(svc.findOne('bad', 'biz-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates an item via prisma', async () => {
      const item = makeItem();
      const { svc, prisma } = makeService();
      prisma.item.create.mockResolvedValue(item);
      const dto: any = { businessId: 'biz-1', storeId: 'store-1', name: 'Cappuccino', retailPriceCents: 50000, category: 'Coffee', taxType: 'VAT', trackStock: false };
      const result = await svc.create(dto);
      expect(prisma.item.create).toHaveBeenCalledTimes(1);
      expect(result.name).toBe('Cappuccino');
    });

    it('creates initial inventory movement when initialStock > 0', async () => {
      const item = makeItem();
      const { svc, prisma, inventory } = makeService();
      prisma.item.create.mockResolvedValue(item);
      const dto: any = { businessId: 'biz-1', storeId: 'store-1', name: 'Cappuccino', retailPriceCents: 50000, category: 'Coffee', taxType: 'VAT', trackStock: true, initialStock: 20 };
      await svc.create(dto);
      expect(inventory.createMovement).toHaveBeenCalledWith(expect.objectContaining({ quantity: 20 }));
    });
  });

  describe('update', () => {
    it('updates item fields', async () => {
      const item = makeItem();
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.item.update.mockResolvedValue({ ...item, name: 'Latte' });
      const result = await svc.update('item-1', 'biz-1', { name: 'Latte' } as any);
      expect(result.name).toBe('Latte');
    });

    it('throws NotFoundException if item not found', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(svc.update('bad', 'biz-1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggle86', () => {
    it('flips soldOut from false to true', async () => {
      const item = makeItem({ soldOut: false });
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.item.update.mockResolvedValue({ ...item, soldOut: true });
      await svc.toggle86('item-1', 'biz-1');
      expect(prisma.item.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { soldOut: true } });
    });

    it('flips soldOut from true to false', async () => {
      const item = makeItem({ soldOut: true });
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.item.update.mockResolvedValue({ ...item, soldOut: false });
      await svc.toggle86('item-1', 'biz-1');
      expect(prisma.item.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { soldOut: false } });
    });

    it('throws NotFoundException if item missing', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(null);
      await expect(svc.toggle86('bad', 'biz-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the item', async () => {
      const item = makeItem();
      const { svc, prisma } = makeService();
      prisma.item.findFirst.mockResolvedValue(item);
      prisma.item.update.mockResolvedValue({ ...item, deletedAt: new Date() });
      await svc.softDelete('item-1', 'biz-1');
      const data = prisma.item.update.mock.calls[0][0].data;
      expect(data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
