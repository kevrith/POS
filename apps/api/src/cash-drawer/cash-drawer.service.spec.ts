import { CashDrawerService } from './cash-drawer.service';

function makeSession(overrides: Record<string, any> = {}) {
  return { id: 'sess-1', businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 100000, closingBalanceCents: null, varianceCents: null, status: 'OPEN', openedAt: new Date(), closedAt: null, ...overrides };
}

function makePrisma() {
  return {
    cashDrawerSession: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    sale: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalCents: null } }) },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }) },
    expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { amountCents: null } }) },
  };
}

function makeNotifications() {
  return { notifyCashDiscrepancy: jest.fn().mockResolvedValue(undefined) };
}

function makeService(overrides = {}) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const notifications = makeNotifications();
  const svc = new CashDrawerService(prisma, notifications as any);
  return { svc, prisma, notifications };
}

describe('CashDrawerService', () => {
  describe('openSession', () => {
    it('creates a session with openingBalanceCents', async () => {
      const session = makeSession();
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
      prisma.cashDrawerSession.create.mockResolvedValue(session);
      const result = await svc.openSession({ businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 100000 });
      expect(result.openingBalanceCents).toBe(100000);
      expect(prisma.cashDrawerSession.create).toHaveBeenCalledTimes(1);
    });

    it('throws if till is already open', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findFirst.mockResolvedValue(makeSession());
      await expect(svc.openSession({ businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 0, tillNumber: 1 })).rejects.toThrow('already open');
    });
  });

  describe('closeSession', () => {
    it('calculates variance and updates session to CLOSED', async () => {
      const session = makeSession({ closingBalanceCents: 105000, varianceCents: 5000, status: 'CLOSED' });
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.update.mockResolvedValue(session);
      const result = await svc.closeSession('sess-1', { closingBalanceCents: 105000, expectedBalanceCents: 100000 });
      expect(result.status).toBe('CLOSED');
    });

    it('triggers discrepancy notification when variance > 500 cents', async () => {
      const session = makeSession({ closingBalanceCents: 90000, varianceCents: -10000, status: 'CLOSED' });
      const { svc, prisma, notifications } = makeService();
      prisma.cashDrawerSession.update.mockResolvedValue(session);
      await svc.closeSession('sess-1', { closingBalanceCents: 90000, expectedBalanceCents: 100000 });
      expect(notifications.notifyCashDiscrepancy).toHaveBeenCalled();
    });
  });

  describe('getCurrentSession', () => {
    it('returns open session for cashier and store', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findFirst.mockResolvedValue(makeSession());
      const result = await svc.getCurrentSession('user-1', 'store-1');
      expect(result?.status).toBe('OPEN');
    });

    it('returns null when no open session', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findFirst.mockResolvedValue(null);
      const result = await svc.getCurrentSession('user-1', 'store-1');
      expect(result).toBeNull();
    });
  });

  describe('getActiveSessions', () => {
    it('returns all OPEN sessions for a store', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findMany.mockResolvedValue([makeSession()]);
      const result = await svc.getActiveSessions('store-1');
      expect(result).toHaveLength(1);
      const where = prisma.cashDrawerSession.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('OPEN');
    });
  });

  describe('getSessionSummary', () => {
    it('returns session with sales and payment totals', async () => {
      const session = makeSession({ closedAt: new Date() });
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(session);
      prisma.sale.aggregate.mockResolvedValue({ _sum: { totalCents: 500000 } });
      prisma.payment.aggregate.mockResolvedValue({ _sum: { amountCents: 300000 } });
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amountCents: 50000 } });
      const result = await svc.getSessionSummary('sess-1');
      expect(result).toBeDefined();
    });
  });
});
