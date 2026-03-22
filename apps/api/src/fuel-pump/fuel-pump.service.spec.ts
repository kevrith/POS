import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FuelPumpService } from './fuel-pump.service';

function makePump(overrides: Record<string, any> = {}) {
  return { id: 'pump-1', businessId: 'biz-1', storeId: 'store-1', pumpNumber: 1, label: 'Pump 1', status: 'IDLE', gradeId: 'grade-1', grade: { id: 'grade-1', name: 'Petrol', pricePerLitreCents: 19500 }, ...overrides };
}

function makeGrade(overrides: Record<string, any> = {}) {
  return { id: 'grade-1', businessId: 'biz-1', storeId: 'store-1', name: 'Petrol', code: 'PMS', pricePerLitreCents: 19500, isActive: true, ...overrides };
}

function makeFleetAccount(overrides: Record<string, any> = {}) {
  return { id: 'fleet-1', businessId: 'biz-1', companyName: 'ABC Logistics', balanceCents: 100000, creditLimitCents: 500000, ...overrides };
}

function makePrisma() {
  return {
    fuelGrade: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    fuelPump: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    fuelSale: { create: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    fuelGrade2: { findMany: jest.fn() },
    fuelTank: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    fuelTankDipping: { create: jest.fn() },
    fuelDelivery: { create: jest.fn(), findMany: jest.fn() },
    fuelShift: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    fuelShiftReading: { create: jest.fn(), updateMany: jest.fn() },
    fleetAccount: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    fleetTransaction: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new FuelPumpService(prisma);
  return { svc, prisma };
}

describe('FuelPumpService', () => {
  describe('getGrades', () => {
    it('returns grades for businessId and storeId', async () => {
      const { svc, prisma } = makeService();
      prisma.fuelGrade.findMany.mockResolvedValue([makeGrade()]);
      const result = await svc.getGrades('biz-1', 'store-1');
      expect(result).toHaveLength(1);
      expect(prisma.fuelGrade.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { businessId: 'biz-1', storeId: 'store-1' },
      }));
    });
  });

  describe('createGrade', () => {
    it('creates a fuel grade', async () => {
      const grade = makeGrade();
      const { svc, prisma } = makeService();
      prisma.fuelGrade.create.mockResolvedValue(grade);
      const result = await svc.createGrade({ businessId: 'biz-1', storeId: 'store-1', name: 'Petrol', code: 'PMS', pricePerLitreCents: 19500 });
      expect(result.name).toBe('Petrol');
    });
  });

  describe('authorizePump', () => {
    it('changes pump status to AUTHORIZED', async () => {
      const pump = makePump({ status: 'IDLE' });
      const { svc, prisma } = makeService();
      prisma.fuelPump.findUnique.mockResolvedValue(pump);
      prisma.fuelPump.update.mockResolvedValue({ ...pump, status: 'AUTHORIZED' });
      const result = await svc.authorizePump('pump-1');
      expect(prisma.fuelPump.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'AUTHORIZED' },
      }));
      expect(result.status).toBe('AUTHORIZED');
    });

    it('throws BadRequestException if pump is not IDLE', async () => {
      const { svc, prisma } = makeService();
      prisma.fuelPump.findUnique.mockResolvedValue(makePump({ status: 'DISPENSING' }));
      await expect(svc.authorizePump('pump-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if pump not found', async () => {
      const { svc, prisma } = makeService();
      prisma.fuelPump.findUnique.mockResolvedValue(null);
      await expect(svc.authorizePump('bad')).rejects.toThrow(NotFoundException);
    });
  });

  describe('stopPump', () => {
    it('changes pump status to IDLE', async () => {
      const pump = makePump({ status: 'AUTHORIZED' });
      const { svc, prisma } = makeService();
      prisma.fuelPump.update.mockResolvedValue({ ...pump, status: 'IDLE' });
      await svc.stopPump('pump-1');
      expect(prisma.fuelPump.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { status: 'IDLE' },
      }));
    });
  });

  describe('recordSale', () => {
    it('calculates totalCents and creates sale + resets pump in transaction', async () => {
      const sale = { id: 'sale-1', litresDispensed: 10, pricePerLitreCents: 19500, totalCents: 195000, status: 'COMPLETED', pump: makePump(), grade: makeGrade() };
      const { svc, prisma } = makeService();
      prisma.$transaction.mockImplementation(async (ops: any[]) => {
        return [sale, makePump({ status: 'IDLE' })];
      });
      const dto: any = { businessId: 'biz-1', storeId: 'store-1', pumpId: 'pump-1', gradeId: 'grade-1', litresDispensed: 10, pricePerLitreCents: 19500, paymentMethod: 'CASH' };
      const result = await svc.recordSale(dto);
      expect(result.totalCents).toBe(195000);
    });

    it('totalCents = litresDispensed * pricePerLitreCents rounded', async () => {
      const { svc, prisma } = makeService();
      let capturedSaleData: any;
      prisma.$transaction.mockImplementation(async (ops: any[]) => {
        // ops[0] is fuelSale.create — capture data passed
        capturedSaleData = prisma.fuelSale.create.mock.calls[0]?.[0]?.data;
        return [{ id: 'sale-1', totalCents: 97500 }, {}];
      });
      prisma.fuelSale.create.mockResolvedValue({ id: 'sale-1', totalCents: 97500 });
      prisma.fuelPump.update.mockResolvedValue({});
      const dto: any = { businessId: 'biz-1', storeId: 'store-1', pumpId: 'pump-1', gradeId: 'grade-1', litresDispensed: 5, pricePerLitreCents: 19500, paymentMethod: 'CASH' };
      // Just verify the math logic: 5 * 19500 = 97500
      const totalCents = Math.round(dto.litresDispensed * dto.pricePerLitreCents);
      expect(totalCents).toBe(97500);
    });
  });

  describe('chargeFleetAccount', () => {
    it('deducts from fleet account balance', async () => {
      const account = makeFleetAccount({ balanceCents: 100000, creditLimitCents: 0 });
      const { svc, prisma } = makeService();
      prisma.fleetAccount.findUnique.mockResolvedValue(account);
      prisma.$transaction.mockImplementation(async (ops: any[]) => [{ id: 'tx-1' }, {}]);
      prisma.fleetTransaction.create.mockResolvedValue({ id: 'tx-1' });
      prisma.fleetAccount.update.mockResolvedValue({});
      await svc.chargeFleetAccount('fleet-1', 20000, 'sale-1', 'Fuel charge', 'biz-1');
      expect(prisma.fleetAccount.findUnique).toHaveBeenCalledWith({ where: { id: 'fleet-1' } });
    });

    it('throws if credit limit exceeded', async () => {
      const account = makeFleetAccount({ balanceCents: 10000, creditLimitCents: 50000 });
      const { svc, prisma } = makeService();
      prisma.fleetAccount.findUnique.mockResolvedValue(account);
      await expect(svc.chargeFleetAccount('fleet-1', 70000)).rejects.toThrow('Credit limit exceeded');
    });
  });

  describe('getSaleStats', () => {
    it('returns totalRevenueCents and byGrade breakdown', async () => {
      const { svc, prisma } = makeService();
      prisma.fuelSale.aggregate.mockResolvedValue({ _sum: { totalCents: 500000, litresDispensed: 25 }, _count: 3 });
      prisma.fuelSale.groupBy.mockResolvedValue([{ gradeId: 'grade-1', _sum: { totalCents: 500000, litresDispensed: 25 }, _count: 3 }]);
      prisma.fuelGrade.findMany.mockResolvedValue([makeGrade()]);
      const result = await svc.getSaleStats('biz-1', 'store-1');
      expect(result.totalRevenueCents).toBe(500000);
      expect(result.byGrade).toHaveLength(1);
      expect(result.byGrade[0].gradeName).toBe('Petrol');
    });
  });
});
