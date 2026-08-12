import { CashDrawerService } from './cash-drawer.service';

function makeSession(overrides: Record<string, any> = {}) {
  return { id: 'sess-1', businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 100000, closingBalanceCents: null, varianceCents: null, status: 'OPEN', openedAt: new Date(), closedAt: null, ...overrides };
}

function makePrisma() {
  return {
    cashDrawerSession: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    // buildSummary reads payments off the sale and refunds off Return, so the
    // mock has to model those relations rather than a bare aggregate.
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    return: { findMany: jest.fn().mockResolvedValue([]) },
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
      prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
      prisma.cashDrawerSession.create.mockResolvedValue(session);
      const result = await svc.openSession({ businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 100000 });
      expect(result.openingBalanceCents).toBe(100000);
      expect(prisma.cashDrawerSession.create).toHaveBeenCalledTimes(1);
    });

    it('throws if the cashier already has an open drawer', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findFirst.mockResolvedValue(makeSession());
      await expect(svc.openSession({ businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 0, tillNumber: 1 })).rejects.toThrow('already have an open drawer');
    });

    it('rejects a blank storeId instead of creating an orphan session', async () => {
      const { svc } = makeService();
      await expect(
        svc.openSession({ businessId: 'biz-1', storeId: '', cashierId: 'user-1', openingBalanceCents: 0 }),
      ).rejects.toThrow('store must be selected');
    });

    it('throws if the till is already open for another cashier', async () => {
      const { svc, prisma } = makeService();
      // no drawer for this cashier, but till 1 is taken
      prisma.cashDrawerSession.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeSession({ cashierId: 'user-2' }));
      await expect(
        svc.openSession({ businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', openingBalanceCents: 0, tillNumber: 1 }),
      ).rejects.toThrow('Till 1 is already open');
    });
  });

  describe('closeSession', () => {
    it('recomputes the expected balance server-side rather than trusting the client', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(makeSession());
      prisma.cashDrawerSession.update.mockResolvedValue(
        makeSession({ closingBalanceCents: 105000, varianceCents: 5000, status: 'CLOSED' }),
      );
      // No sales: expected = opening float (100000). A wildly wrong client value
      // must be ignored.
      const result = await svc.closeSession('sess-1', { closingBalanceCents: 105000, expectedBalanceCents: 999999 });
      expect(result.status).toBe('CLOSED');
      const data = prisma.cashDrawerSession.update.mock.calls[0][0].data;
      expect(data.expectedBalanceCents).toBe(100000);
      expect(data.varianceCents).toBe(5000);
    });

    it('refuses to close an already-closed session', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(makeSession({ status: 'CLOSED' }));
      await expect(svc.closeSession('sess-1', { closingBalanceCents: 1 })).rejects.toThrow('already closed');
    });

    it('triggers discrepancy notification when variance > 500 cents', async () => {
      const { svc, prisma, notifications } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(makeSession());
      prisma.cashDrawerSession.update.mockResolvedValue(
        makeSession({ closingBalanceCents: 90000, varianceCents: -10000, status: 'CLOSED' }),
      );
      await svc.closeSession('sess-1', { closingBalanceCents: 90000 });
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
    it('builds the payment breakdown the drawer screen renders', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(makeSession({ closedAt: new Date() }));
      prisma.sale.findMany.mockResolvedValue([
        { id: 's1', totalCents: 300000, vatCents: 41379, payments: [{ method: 'CASH', amountCents: 300000 }] },
        { id: 's2', totalCents: 200000, vatCents: 27586, payments: [{ method: 'MPESA_STK', amountCents: 200000 }] },
      ]);
      prisma.expense.aggregate.mockResolvedValue({ _sum: { amountCents: 50000 } });

      const result = await svc.getSessionSummary('sess-1');

      expect(result.totalSalesCents).toBe(500000);
      expect(result.transactionCount).toBe(2);
      expect(result.cashSalesCents).toBe(300000);
      expect(result.mpesaSalesCents).toBe(200000);
      expect(result.paymentBreakdown).toEqual([
        { method: 'CASH', amountCents: 300000, count: 1 },
        { method: 'MPESA_STK', amountCents: 200000, count: 1 },
      ]);
      // opening 100000 + cash 300000 - expenses 50000
      expect(result.expectedClosingCents).toBe(350000);
    });

    it('subtracts cash refunds from the expected drawer balance', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(makeSession());
      prisma.sale.findMany.mockResolvedValue([
        { id: 's1', totalCents: 100000, vatCents: 0, payments: [{ method: 'CASH', amountCents: 100000 }] },
      ]);
      prisma.return.findMany.mockResolvedValue([
        { refundAmountCents: 20000, refundMethod: 'CASH' },
        { refundAmountCents: 30000, refundMethod: 'STORE_CREDIT' },
      ]);

      const result = await svc.getSessionSummary('sess-1');

      expect(result.refundsCents).toBe(50000);
      expect(result.cashRefundsCents).toBe(20000);
      // Store credit never leaves the till, so only the cash refund is subtracted.
      expect(result.expectedClosingCents).toBe(100000 + 100000 - 20000);
    });

    it('throws when the session does not exist', async () => {
      const { svc, prisma } = makeService();
      prisma.cashDrawerSession.findUnique.mockResolvedValue(null);
      await expect(svc.getSessionSummary('nope')).rejects.toThrow('not found');
    });
  });
});
