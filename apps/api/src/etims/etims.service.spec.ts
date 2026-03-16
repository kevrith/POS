import { BadRequestException } from '@nestjs/common';
import { EtimsService } from './etims.service';

// ─── Prisma mock factory ──────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    sale: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    business: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    voidRecord: {
      updateMany: jest.fn(),
    },
    expense: {
      findMany: jest.fn(),
    },
    ...overrides,
  };
}

function makeAudit() {
  return { createEntry: jest.fn().mockResolvedValue(undefined) };
}

describe('EtimsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let audit: ReturnType<typeof makeAudit>;
  let svc: EtimsService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = makeAudit();
    svc = new EtimsService(prisma as any, audit as any);
  });

  // ─── submitSale ────────────────────────────────────────────────────────────

  describe('submitSale', () => {
    it('throws BadRequestException when sale not found', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      await expect(svc.submitSale('no-such-sale')).rejects.toThrow(BadRequestException);
    });

    it('returns existing controlNumber without update when already submitted', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        businessId: 'biz-1',
        etimsSubmitted: true,
        etimsControlNumber: 'ETM_EXISTING',
      });

      const result = await svc.submitSale('sale-1');

      expect(result.success).toBe(true);
      expect(result.controlNumber).toBe('ETM_EXISTING');
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    it('generates a controlNumber and marks sale submitted', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        businessId: 'biz-1',
        etimsSubmitted: false,
        etimsControlNumber: null,
      });
      prisma.sale.update.mockResolvedValue({});

      const result = await svc.submitSale('sale-1');

      expect(result.success).toBe(true);
      expect(result.controlNumber).toMatch(/^ETM\d+$/);
      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 'sale-1' },
        data: expect.objectContaining({ etimsSubmitted: true }),
      });
    });

    it('creates an audit entry after successful submission', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-2',
        businessId: 'biz-2',
        etimsSubmitted: false,
        etimsControlNumber: null,
      });
      prisma.sale.update.mockResolvedValue({});

      await svc.submitSale('sale-2');

      expect(audit.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ETIMS_SUBMIT', entityId: 'sale-2' }),
      );
    });
  });

  // ─── submitAmendment ───────────────────────────────────────────────────────

  describe('submitAmendment', () => {
    it('throws when sale not found', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);
      await expect(svc.submitAmendment('no-id')).rejects.toThrow(BadRequestException);
    });

    it('creates an audit entry and returns success', async () => {
      prisma.sale.findUnique.mockResolvedValue({ id: 's1', businessId: 'b1' });

      const result = await svc.submitAmendment('s1');

      expect(result.success).toBe(true);
      expect(audit.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ETIMS_AMEND', entityId: 's1' }),
      );
    });
  });

  // ─── getPendingCount ───────────────────────────────────────────────────────

  describe('getPendingCount', () => {
    it('returns count of unsubmitted PAID sales for a business', async () => {
      prisma.sale.count.mockResolvedValue(7);

      const result = await svc.getPendingCount('biz-1');

      expect(result.count).toBe(7);
      expect(prisma.sale.count).toHaveBeenCalledWith({
        where: { businessId: 'biz-1', etimsSubmitted: false, status: 'PAID' },
      });
    });
  });

  // ─── getStockStatus ────────────────────────────────────────────────────────

  describe('getStockStatus', () => {
    it('returns pending and submitted counts', async () => {
      prisma.sale.count
        .mockResolvedValueOnce(3)   // pending
        .mockResolvedValueOnce(42); // submitted

      const result = await svc.getStockStatus('biz-1');

      expect(result.pending).toBe(3);
      expect(result.submitted).toBe(42);
    });
  });

  // ─── batchSubmit ──────────────────────────────────────────────────────────

  describe('batchSubmit', () => {
    it('submits all pending sales and returns correct counts', async () => {
      const pendingSales = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
      prisma.sale.findMany.mockResolvedValue(pendingSales);

      // Each submitSale call: first findUnique returns non-submitted, update succeeds
      prisma.sale.findUnique
        .mockResolvedValueOnce({ id: 's1', businessId: 'b1', etimsSubmitted: false, etimsControlNumber: null })
        .mockResolvedValueOnce({ id: 's2', businessId: 'b1', etimsSubmitted: false, etimsControlNumber: null })
        .mockResolvedValueOnce({ id: 's3', businessId: 'b1', etimsSubmitted: false, etimsControlNumber: null });
      prisma.sale.update.mockResolvedValue({});

      const result = await svc.batchSubmit('biz-1');

      expect(result.submitted).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('counts failures when individual submissions throw', async () => {
      prisma.sale.findMany.mockResolvedValue([{ id: 'bad-id' }]);
      prisma.sale.findUnique.mockResolvedValue(null); // will throw BadRequestException

      const result = await svc.batchSubmit('biz-1');

      expect(result.submitted).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('processes up to 50 sales at a time', async () => {
      prisma.sale.findMany.mockResolvedValue([]); // empty

      const result = await svc.batchSubmit('biz-1');

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
      expect(result.submitted).toBe(0);
    });
  });

  // ─── getVatReturnData ─────────────────────────────────────────────────────

  describe('getVatReturnData', () => {
    it('aggregates sales and expenses for the given period', async () => {
      prisma.sale.findMany.mockResolvedValue([
        { totalCents: 10_000, vatCents: 1_379, items: [] },
        { totalCents: 20_000, vatCents: 2_759, items: [] },
      ]);
      prisma.expense.findMany.mockResolvedValue([
        { amountCents: 5_000, vatAmountCents: 690 },
      ]);

      const result = await svc.getVatReturnData('biz-1', '2026-03');

      expect(result.totalSales).toBeCloseTo(300); // 30000 cents → KES 300
      expect(result.vatOnSales).toBeCloseTo(41.38); // (1379+2759) cents → KES 41.38
      expect(result.totalPurchases).toBeCloseTo(50); // 5000 cents → KES 50
      expect(result.salesCount).toBe(2);
      expect(result.expensesCount).toBe(1);
    });
  });
});
