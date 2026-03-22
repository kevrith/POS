import { BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryMovementType } from '@pos/shared';

function makePrisma() {
  return {
    inventoryMovement: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
    item: { findUnique: jest.fn(), findMany: jest.fn() },
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new InventoryService(prisma);
  return { svc, prisma };
}

describe('InventoryService', () => {
  describe('getStockLevel', () => {
    it('returns sum of movements for item+store', async () => {
      const { svc, prisma } = makeService();
      prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 42 } });
      const result = await svc.getStockLevel('item-1', 'store-1');
      expect(result).toBe(42);
      expect(prisma.inventoryMovement.aggregate).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ itemId: 'item-1', storeId: 'store-1' }),
      }));
    });

    it('returns 0 when no movements exist', async () => {
      const { svc, prisma } = makeService();
      prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: null } });
      const result = await svc.getStockLevel('item-1', 'store-1');
      expect(result).toBe(0);
    });
  });

  describe('getStockLevels', () => {
    it('returns a map of itemId to quantity', async () => {
      const { svc, prisma } = makeService();
      prisma.inventoryMovement.groupBy.mockResolvedValue([
        { itemId: 'item-1', _sum: { quantity: 10 } },
        { itemId: 'item-2', _sum: { quantity: 5 } },
      ]);
      const result = await svc.getStockLevels(['item-1', 'item-2'], 'store-1');
      expect(result.get('item-1')).toBe(10);
      expect(result.get('item-2')).toBe(5);
    });

    it('returns empty map for empty item list', async () => {
      const { svc, prisma } = makeService();
      prisma.inventoryMovement.groupBy.mockResolvedValue([]);
      const result = await svc.getStockLevels([], 'store-1');
      expect(result.size).toBe(0);
    });
  });

  describe('createMovement', () => {
    it('creates an InventoryMovement with correct fields', async () => {
      const { svc, prisma } = makeService();
      prisma.inventoryMovement.create.mockResolvedValue({});
      await svc.createMovement({ itemId: 'item-1', storeId: 'store-1', quantity: 20, type: InventoryMovementType.ADJUSTMENT, businessId: 'biz-1' });
      expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ itemId: 'item-1', quantity: 20 }),
      }));
    });
  });

  describe('checkAndDeductStock', () => {
    it('throws BadRequestException when stock insufficient and policy is BLOCK', async () => {
      const { svc, prisma } = makeService();
      prisma.item.findUnique.mockResolvedValue({ id: 'item-1', trackStock: true });
      prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 2 } });
      prisma.inventoryMovement.create.mockResolvedValue({});
      const tx: any = { item: { findUnique: jest.fn().mockResolvedValue({ id: 'item-1', trackStock: true, name: 'Test' }) }, inventoryMovement: { create: jest.fn() } };
      // Mock getStockLevel via aggregate on the tx object — use the real prisma stub
      jest.spyOn(svc, 'getStockLevel').mockResolvedValue(2);
      await expect(svc.checkAndDeductStock('item-1', 'store-1', 5, 'sale-1', tx)).rejects.toThrow(BadRequestException);
    });

    it('skips stock tracking for SERVICE items', async () => {
      const { svc } = makeService();
      const tx: any = { item: { findUnique: jest.fn().mockResolvedValue({ id: 'item-1', trackStock: false }) }, inventoryMovement: { create: jest.fn() } };
      await expect(svc.checkAndDeductStock('item-1', 'store-1', 5, 'sale-1', tx)).resolves.toBeUndefined();
      expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('getMovementHistory', () => {
    it('returns movements for an item ordered by createdAt desc', async () => {
      const { svc, prisma } = makeService();
      const movements = [{ id: 'm1', quantity: 10, type: 'PURCHASE', createdAt: new Date() }];
      prisma.inventoryMovement.findMany.mockResolvedValue(movements);
      const result = await svc.getMovementHistory('item-1', 'store-1', 50);
      expect(result).toHaveLength(1);
      expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ itemId: 'item-1' }),
        orderBy: { createdAt: 'desc' },
      }));
    });
  });
});
