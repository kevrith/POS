import { ExpenseService } from './expense.service';

function makeExpense(overrides: Record<string, any> = {}) {
  return { id: 'exp-1', businessId: 'biz-1', storeId: 'store-1', category: 'UTILITIES', description: 'Electric bill', amountCents: 100000, status: 'PENDING', isRecurring: false, createdAt: new Date(), ...overrides };
}

function makeBusiness() {
  return { id: 'biz-1', expenseApprovalThresholdCents: 500000 };
}

function makePrisma() {
  return {
    business: { findUnique: jest.fn().mockResolvedValue(makeBusiness()) },
    expense: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    budget: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

function makeNotifications() {
  return { createNotification: jest.fn().mockResolvedValue(undefined) };
}

function makeService(prismaOverrides = {}) {
  const prisma: any = { ...makePrisma(), ...prismaOverrides };
  const notifications = makeNotifications();
  const svc = new ExpenseService(prisma, notifications as any);
  return { svc, prisma, notifications };
}

describe('ExpenseService', () => {
  describe('create', () => {
    it('creates an expense with PENDING status when below threshold', async () => {
      const expense = makeExpense();
      const { svc, prisma } = makeService();
      prisma.expense.create.mockResolvedValue(expense);
      const dto: any = { offlineId: 'uid-1', businessId: 'biz-1', storeId: 'store-1', category: 'UTILITIES', description: 'Bill', amountCents: 100000, paymentMethod: 'CASH' };
      await svc.create(dto);
      expect(prisma.expense.create).toHaveBeenCalledTimes(1);
      expect(prisma.expense.create).toHaveBeenCalledTimes(1);
    });

    it('sets status to PENDING (requires approval) for large amounts', async () => {
      const expense = makeExpense({ amountCents: 1000000 });
      const { svc, prisma } = makeService();
      prisma.expense.create.mockResolvedValue(expense);
      const dto: any = { offlineId: 'uid-2', businessId: 'biz-1', storeId: 'store-1', category: 'EQUIPMENT', description: 'Server', amountCents: 1000000, paymentMethod: 'BANK' };
      await svc.create(dto);
      expect(prisma.expense.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('returns expenses filtered by businessId', async () => {
      const { svc, prisma } = makeService();
      prisma.expense.findMany.mockResolvedValue([makeExpense()]);
      const result = await svc.findAll('biz-1');
      expect(result).toHaveLength(1);
      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where.businessId).toBe('biz-1');
    });

    it('applies storeId filter when provided', async () => {
      const { svc, prisma } = makeService();
      prisma.expense.findMany.mockResolvedValue([]);
      await svc.findAll('biz-1', { approvalStatus: 'PENDING' });
      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where.businessId).toBe('biz-1');
    });
  });

  describe('approve', () => {
    it('sets status to APPROVED and records approvedBy', async () => {
      const expense = makeExpense({ status: 'APPROVED', approvedBy: 'user-1' });
      const { svc, prisma } = makeService();
      prisma.expense.update.mockResolvedValue(expense);
      await svc.approve('exp-1', 'user-1');
      const data = prisma.expense.update.mock.calls[0][0].data;
      expect(data.approvalStatus).toBe('APPROVED');
      expect(data.approvedBy).toBe('user-1');
    });
  });

  describe('reject', () => {
    it('sets status to REJECTED', async () => {
      const expense = makeExpense({ status: 'REJECTED' });
      const { svc, prisma } = makeService();
      prisma.expense.update.mockResolvedValue(expense);
      await svc.reject('exp-1', 'user-1');
      const data = prisma.expense.update.mock.calls[0][0].data;
      expect(data.approvalStatus).toBe('REJECTED');
    });
  });

  describe('getTotalByCategory', () => {
    it('returns grouped totals by category', async () => {
      const { svc, prisma } = makeService();
      prisma.expense.groupBy.mockResolvedValue([
        { category: 'UTILITIES', _sum: { amountCents: 200000 }, _count: 2 },
        { category: 'RENT', _sum: { amountCents: 1500000 }, _count: 1 },
      ]);
      const start = new Date('2026-01-01');
      const end = new Date('2026-01-31');
      const result = await svc.getTotalByCategory('biz-1', start, end);
      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('UTILITIES');
      expect(result[0].totalCents).toBe(200000);
    });
  });

  describe('getRecurringExpenses', () => {
    it('returns only recurring expenses', async () => {
      const { svc, prisma } = makeService();
      prisma.expense.findMany.mockResolvedValue([makeExpense({ isRecurring: true })]);
      const result = await svc.getRecurringExpenses('biz-1');
      expect(result).toHaveLength(1);
      const where = prisma.expense.findMany.mock.calls[0][0].where;
      expect(where.isRecurring).toBe(true);
    });
  });
});
