import { LoyaltyService } from './loyalty.service';

function makeCustomer(overrides: Record<string, any> = {}) {
  return { id: 'cust-1', businessId: 'biz-1', name: 'Alice', loyaltyPoints: 200, ...overrides };
}

function makeProgram(overrides: Record<string, any> = {}) {
  return { id: 'prog-1', businessId: 'biz-1', kesPerPoint: 100, pointValueCents: 1, minRedemption: 50, isActive: true, ...overrides };
}

function makePrisma() {
  return {
    loyaltyProgram: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    loyaltyTransaction: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    loyaltyTier: { findMany: jest.fn().mockResolvedValue([]) },
    customer: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const svc = new LoyaltyService(prisma);
  return { svc, prisma };
}

describe('LoyaltyService', () => {
  describe('getProgram', () => {
    it('returns program for businessId', async () => {
      const program = makeProgram();
      const { svc, prisma } = makeService();
      prisma.loyaltyProgram.findFirst.mockResolvedValue(program);
      const result = await svc.getProgram('biz-1');
      expect(result?.id).toBe('prog-1');
    });

    it('returns null when no program exists', async () => {
      const { svc, prisma } = makeService();
      prisma.loyaltyProgram.findFirst.mockResolvedValue(null);
      const result = await svc.getProgram('biz-1');
      expect(result).toBeNull();
    });
  });

  describe('earnPoints', () => {
    it('calculates points from saleCents and creates transaction', async () => {
      const customer = makeCustomer({ loyaltyPoints: 0 });
      const program = makeProgram({ kesPerPoint: 100 }); // 1 point per KES 100
      const { svc, prisma } = makeService();
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.loyaltyProgram.findFirst.mockResolvedValue(program);
      prisma.loyaltyTransaction.findFirst.mockResolvedValue(null);
      prisma.customer.update.mockResolvedValue({ ...customer, loyaltyPoints: 10 });
      const result = await svc.earnPoints('cust-1', 100000, 'sale-1');
      expect(result.points).toBe(10); // 100000 cents = 1000 KES / 100 = 10 points
      expect(prisma.loyaltyTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ type: 'EARN', points: 10 }),
      }));
    });

    it('returns 0 points if no loyalty program', async () => {
      const { svc, prisma } = makeService();
      prisma.customer.findUnique.mockResolvedValue(makeCustomer());
      prisma.loyaltyProgram.findFirst.mockResolvedValue(null);
      const result = await svc.earnPoints('cust-1', 5000, 'sale-1');
      expect(result.points).toBe(0);
    });
  });

  describe('redeemPoints', () => {
    it('deducts points and returns discount cents', async () => {
      const customer = makeCustomer({ loyaltyPoints: 200 });
      const program = makeProgram({ pointValueCents: 1, minRedemption: 50 });
      const { svc, prisma } = makeService();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          customer: { findUnique: jest.fn().mockResolvedValue(customer), update: jest.fn().mockResolvedValue({ ...customer, loyaltyPoints: 100 }) },
          loyaltyProgram: { findFirst: jest.fn().mockResolvedValue(program) },
          loyaltyTransaction: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });
      const result = await svc.redeemPoints('cust-1', 100, 'sale-1');
      expect(result.discountCents).toBe(100);
      expect(result.balance).toBe(100);
    });

    it('throws if points below minimum redemption', async () => {
      const program = makeProgram({ minRedemption: 100 });
      const { svc, prisma } = makeService();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          customer: { findUnique: jest.fn().mockResolvedValue(makeCustomer({ loyaltyPoints: 200 })) },
          loyaltyProgram: { findFirst: jest.fn().mockResolvedValue(program) },
          loyaltyTransaction: { create: jest.fn() },
        };
        return fn(tx);
      });
      await expect(svc.redeemPoints('cust-1', 50, 'sale-1')).rejects.toThrow('minimum');
    });

    it('throws if customer has insufficient points', async () => {
      const { svc, prisma } = makeService();
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          customer: { findUnique: jest.fn().mockResolvedValue(makeCustomer({ loyaltyPoints: 10 })) },
          loyaltyProgram: { findFirst: jest.fn().mockResolvedValue(makeProgram({ minRedemption: 5 })) },
          loyaltyTransaction: { create: jest.fn() },
        };
        return fn(tx);
      });
      await expect(svc.redeemPoints('cust-1', 100, 'sale-1')).rejects.toThrow('Insufficient');
    });
  });

  describe('getCustomerPoints', () => {
    it('returns points balance and transactions for customer', async () => {
      const customer = makeCustomer({ loyaltyPoints: 150 });
      const { svc, prisma } = makeService();
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.loyaltyTransaction.findMany.mockResolvedValue([{ id: 'lt-1', points: 50, type: 'EARN' }]);
      const result = await svc.getCustomerPoints('cust-1');
      expect(result.balance).toBe(150);
      expect(result.transactions).toHaveLength(1);
    });
  });
});
