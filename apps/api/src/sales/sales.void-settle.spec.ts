import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';

const BIZ = 'biz-1';

function build() {
  const tx: any = {
    sale: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    saleItem: { update: jest.fn() },
    voidRecord: { create: jest.fn().mockResolvedValue({ id: 'vr-1' }) },
    customer: { update: jest.fn().mockResolvedValue({}) },
    guestFolioCharge: { findFirst: jest.fn().mockResolvedValue(null) },
    prescriptionFill: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    insuranceClaim: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() },
    prescription: { findFirst: jest.fn(), updateMany: jest.fn() },
    controlledSubstanceLog: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    appointment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    cyberSession: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay-12345678' }) },
    cashMovement: { create: jest.fn().mockResolvedValue({}) },
    inventoryMovement: { create: jest.fn() },
  };
  const prisma: any = {
    ...tx,
    sale: { ...tx.sale, findFirst: jest.fn() },
    journalEntry: { findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };
  const ledger = { autoPost: jest.fn().mockResolvedValue(undefined) };
  const audit = { createEntry: jest.fn().mockResolvedValue(undefined) };
  const etims = { voidSale: jest.fn().mockResolvedValue(undefined) };
  const loyalty = { earnPoints: jest.fn().mockResolvedValue({}) };
  const svc: any = new (SalesService as any)();
  Object.assign(svc, { prisma, ledger, audit, etims, loyalty });
  return { svc, tx, prisma, ledger, audit, etims, loyalty };
}

const item = (o: Record<string, any> = {}) => ({ id: 'si-1', itemId: null, quantity: 1, totalCents: 11_600, discountCents: 0, unitPriceCents: 11_600, vatCents: 1_600, ...o });
const sale = (o: Record<string, any> = {}) => ({ id: 'sale-1', receiptNumber: 'NRB-1', storeId: 'store-1', status: 'PAID', totalCents: 11_600, customerId: null, items: [item()], payments: [], ...o });

describe('voidInTx', () => {
  it('voids a paid sale whole and reports what the books need', async () => {
    const { svc, tx } = build();
    tx.sale.findFirst.mockResolvedValue(sale());
    const r = await svc.voidInTx(tx, 'sale-1', BIZ, 'mgr', 'wrong');
    expect(r).toEqual(expect.objectContaining({ newStatus: 'VOIDED', refundAmountCents: 11_600, receiptNumber: 'NRB-1', saleTotalCents: 11_600, voidRecordId: 'vr-1', isLineItemVoid: false }));
  });

  it('voids a credit sale too, cancelling what the customer owed', async () => {
    const { svc, tx } = build();
    tx.sale.findFirst.mockResolvedValue(sale({ status: 'CREDIT', customerId: 'cust-1' }));
    await svc.voidInTx(tx, 'sale-1', BIZ, 'mgr', 'wrong');
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { balanceCents: { increment: 11_600 } } });
  });

  it('will not void a part-paid credit sale, a settled one, or a missing one', async () => {
    const { svc, tx } = build();
    tx.sale.findFirst.mockResolvedValue(sale({ status: 'CREDIT', payments: [{ amountCents: 100 }] }));
    await expect(svc.voidInTx(tx, 'sale-1', BIZ, 'm', 'r')).rejects.toThrow(/Part of this credit sale/);
    tx.sale.findFirst.mockResolvedValue(sale({ status: 'VOIDED' }));
    await expect(svc.voidInTx(tx, 'sale-1', BIZ, 'm', 'r')).rejects.toThrow(/Can only void paid sales/);
    tx.sale.findFirst.mockResolvedValue(null);
    await expect(svc.voidInTx(tx, 'sale-1', BIZ, 'm', 'r')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('afterVoid (the books and KRA)', () => {
  const result = (o: Record<string, any> = {}) => ({ newStatus: 'VOIDED', isLineItemVoid: false, receiptNumber: 'NRB-1', saleTotalCents: 11_600, refundAmountCents: 11_600, voidRecordId: 'vr-1', ...o });
  const journal = { storeId: 'store-1', lines: [
    { accountCode: '1000', accountName: 'Cash', debitCents: 11_600, creditCents: 0 },
    { accountCode: '2100', accountName: 'VAT', debitCents: 0, creditCents: 1_600 },
    { accountCode: '4000', accountName: 'Revenue', debitCents: 0, creditCents: 10_000 },
  ] };

  it('posts the mirror of the sale journal, tells KRA, and keeps the audit trail', async () => {
    const { svc, prisma, ledger, audit, etims } = build();
    prisma.journalEntry.findFirst.mockResolvedValue(journal);
    await svc.afterVoid('sale-1', BIZ, 'mgr', 'wrong', result());
    await new Promise((r) => setImmediate(r));
    expect(audit.createEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'SALE_VOIDED' }));
    expect(etims.voidSale).toHaveBeenCalledWith('sale-1', 'wrong');
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: BIZ, reference: 'NRB-1', sourceType: 'SALE' } }));
    const posted = ledger.autoPost.mock.calls[0][0];
    expect(posted).toEqual(expect.objectContaining({ reference: 'VOID-NRB-1', sourceType: 'SALE_VOID' }));
    expect(posted.lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1000', 0, 11_600], ['2100', 1_600, 0], ['4000', 10_000, 0]]);
  });

  it('a line void takes back only its share, under its own reference', async () => {
    const { svc, prisma, ledger } = build();
    prisma.journalEntry.findFirst.mockResolvedValue(journal);
    await svc.afterVoid('sale-1', BIZ, 'mgr', 'one line', result({ isLineItemVoid: true, newStatus: 'AMENDED', refundAmountCents: 5_800 }));
    await new Promise((r) => setImmediate(r));
    const posted = ledger.autoPost.mock.calls[0][0];
    expect(posted.reference).toBe('VOIDLINE-vr-1');
    expect(posted.lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1000', 0, 5_800], ['2100', 800, 0], ['4000', 5_000, 0]]);
  });

  it('posts nothing when the sale had no journal', async () => {
    const { svc, prisma, ledger } = build();
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    await svc.afterVoid('sale-1', BIZ, 'mgr', 'x', result());
    await new Promise((r) => setImmediate(r));
    expect(ledger.autoPost).not.toHaveBeenCalled();
  });
});

describe('returning a prescription fill by voiding its sale', () => {
  const fill = { id: 'f1', prescriptionId: 'rx-1', saleId: 'sale-1', prevLastFillDate: new Date('2026-10-01'), prevNextFillDate: new Date('2026-10-31') };
  const rx = (o: Record<string, any> = {}) => ({ id: 'rx-1', refillsUsed: 1, ...o });

  it('the first fill goes back to a waiting prescription, the claim is cancelled, the register gets a return', async () => {
    const { svc, tx } = build();
    tx.prescriptionFill.findFirst.mockResolvedValue(fill);
    tx.insuranceClaim.findFirst.mockResolvedValue({ id: 'c1', status: 'SUBMITTED' });
    tx.prescription.findFirst.mockResolvedValue(rx());
    tx.controlledSubstanceLog.findMany.mockResolvedValue([{ prescriptionId: 'rx-1', itemName: 'Morphine', scheduleClass: 'II', quantityDispensed: 10, unit: 'ml', patientName: 'Jane', prescriberName: 'Dr X' }]);
    await svc.releasePharmacyFill(tx, BIZ, { id: 'sale-1', receiptNumber: 'NRB-1' }, true, 'mgr');
    expect(tx.insuranceClaim.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', businessId: BIZ }, data: { status: 'VOIDED' } });
    expect(tx.prescription.updateMany).toHaveBeenCalledWith({ where: { id: 'rx-1', businessId: BIZ }, data: expect.objectContaining({ status: 'PENDING', refillsUsed: 0, dispensedAt: null, nextFillDate: null }) });
    expect(tx.prescriptionFill.updateMany).toHaveBeenCalledWith({ where: { id: 'f1', businessId: BIZ }, data: { voidedAt: expect.any(Date) } });
    expect(tx.controlledSubstanceLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantityDispensed: -10, itemName: 'Morphine', dispensedBy: 'mgr', notes: 'Returned: fill voided, receipt NRB-1' }) });
  });

  it('a refill goes back to the fill before it', async () => {
    const { svc, tx } = build();
    tx.prescriptionFill.findFirst.mockResolvedValue(fill);
    tx.prescription.findFirst.mockResolvedValue(rx({ refillsUsed: 2 }));
    await svc.releasePharmacyFill(tx, BIZ, { id: 'sale-1', receiptNumber: 'NRB-1' }, true, 'mgr');
    expect(tx.prescription.updateMany.mock.calls[0][0].data).toEqual({ refillsUsed: 1, lastFillDate: fill.prevLastFillDate, nextFillDate: fill.prevNextFillDate });
  });

  it('is refused once the insurer has paid, and a sale that was no fill is untouched', async () => {
    const { svc, tx } = build();
    await svc.releasePharmacyFill(tx, BIZ, { id: 'sale-9', receiptNumber: 'X' }, true, 'mgr');
    expect(tx.prescription.updateMany).not.toHaveBeenCalled();
    tx.prescriptionFill.findFirst.mockResolvedValue(fill);
    tx.insuranceClaim.findFirst.mockResolvedValue({ id: 'c1', status: 'PAID' });
    await expect(svc.releasePharmacyFill(tx, BIZ, { id: 'sale-1', receiptNumber: 'NRB-1' }, true, 'mgr')).rejects.toThrow(/already paid/);
    await expect(svc.releasePharmacyFill(tx, BIZ, { id: 'sale-1', receiptNumber: 'NRB-1', totalCents: 20_000 }, false, 'mgr', [{ name: 'Morphine', quantity: 1, cents: 2_000 }])).rejects.toThrow(/already paid/);
    expect(tx.prescription.updateMany).not.toHaveBeenCalled();
  });

  describe('returning part of a fill', () => {
    const logged = (qty: number, extra: Record<string, any> = {}) => ({ prescriptionId: 'rx-1', itemName: 'Morphine', scheduleClass: 'II', quantityDispensed: qty, unit: 'ml', patientName: 'Jane', prescriberName: 'Dr X', ...extra });
    const setup = () => {
      const ctx = build();
      ctx.tx.prescriptionFill.findFirst.mockResolvedValue(fill);
      ctx.tx.insuranceClaim.findFirst.mockResolvedValue({ id: 'c1', status: 'APPROVED', billedCents: 16_000, approvedCents: 16_000 });
      ctx.tx.controlledSubstanceLog.findMany.mockResolvedValue([logged(10), logged(5, { itemName: 'Paracetamol', scheduleClass: 'IV' })]);
      return ctx;
    };
    const sale = { id: 'sale-1', receiptNumber: 'NRB-1', totalCents: 20_000 };

    it('leaves the prescription as it is, brings the claim down by the insurer\'s share, and logs only what came back', async () => {
      const { svc, tx } = setup();
      // 4 of the 10 ml returned: 40% of Morphine's line value 8,000 = 3,200 of the 20,000 sale.
      await svc.releasePharmacyFill(tx, BIZ, sale, false, 'mgr', [{ name: 'Morphine', quantity: 4, cents: 3_200 }]);
      expect(tx.prescription.updateMany).not.toHaveBeenCalled();
      expect(tx.prescriptionFill.updateMany).not.toHaveBeenCalled();
      // Insurer's share of 3,200 is 16,000/20,000 of it = 2,560.
      expect(tx.insuranceClaim.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', businessId: BIZ }, data: { billedCents: 13_440, approvedCents: 13_440 } });
      expect(tx.controlledSubstanceLog.create).toHaveBeenCalledTimes(1);
      expect(tx.controlledSubstanceLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemName: 'Morphine', quantityDispensed: -4, notes: 'Returned in part: fill voided, receipt NRB-1' }) });
    });

    it('returning everything on the claim voids it; a drug that was not returned is not logged', async () => {
      const { svc, tx } = setup();
      await svc.releasePharmacyFill(tx, BIZ, sale, false, 'mgr', [{ name: 'Morphine', quantity: 10, cents: 20_000 }]);
      expect(tx.insuranceClaim.updateMany).toHaveBeenCalledWith({ where: { id: 'c1', businessId: BIZ }, data: { status: 'VOIDED', billedCents: 0, approvedCents: 0 } });
      expect(tx.controlledSubstanceLog.create.mock.calls.map((c: any) => c[0].data.itemName)).toEqual(['Morphine']);
    });

    it('a fill with no insurer just logs the return', async () => {
      const { svc, tx } = setup();
      tx.insuranceClaim.findFirst.mockResolvedValue(null);
      await svc.releasePharmacyFill(tx, BIZ, sale, false, 'mgr', [{ name: 'Morphine', quantity: 1, cents: 800 }]);
      expect(tx.insuranceClaim.updateMany).not.toHaveBeenCalled();
      expect(tx.controlledSubstanceLog.create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('markCreditPaid', () => {
  const credit = (o: Record<string, any> = {}) => ({ id: 'sale-1', notes: null, receiptNumber: 'NRB-1', storeId: 'store-1', status: 'CREDIT', totalCents: 10_000, customerId: 'cust-1', payments: [], ...o });

  it('settles it in full: PAID, balance back, a pay-in on the drawer and the receivable cleared', async () => {
    const { svc, prisma, tx, ledger, loyalty } = build();
    prisma.sale.findFirst.mockResolvedValue(credit());
    const r = await svc.markCreditPaid('sale-1', BIZ, undefined, 'cash', { id: 'u1' });
    expect(r).toEqual({ success: true, settled: true, paidCents: 10_000, owingCents: 0 });
    expect(tx.sale.updateMany).toHaveBeenCalledWith({ where: { id: 'sale-1', businessId: BIZ, status: 'CREDIT' }, data: { status: 'PAID' } });
    expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: 'cust-1' }, data: { balanceCents: { increment: 10_000 } } });
    expect(tx.payment.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ method: 'CASH', amountCents: 10_000 }));
    expect(tx.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_IN', method: 'CASH', amountCents: 10_000, reason: 'CREDIT_SETTLEMENT', cashierId: 'u1' }) });
    await new Promise((r2) => setImmediate(r2));
    expect(ledger.autoPost.mock.calls[0][0]).toEqual(expect.objectContaining({ reference: 'SETTLE-NRB-1-pay-1234', sourceType: 'CREDIT_SETTLEMENT' }));
    expect(ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1000', 10_000, 0], ['1200', 0, 10_000]]);
    expect(loyalty.earnPoints).toHaveBeenCalled();
  });

  it('a part payment leaves the sale on credit and says how much is still owed', async () => {
    const { svc, prisma, tx } = build();
    prisma.sale.findFirst.mockResolvedValue(credit({ payments: [{ amountCents: 2_000 }] }));
    const r = await svc.markCreditPaid('sale-1', BIZ, 3_000, 'MPESA', { id: 'u1' });
    expect(r).toEqual({ success: true, settled: false, paidCents: 3_000, owingCents: 5_000 });
    expect(tx.sale.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { notes: null } }));
  });

  it('refuses more than is owed, an odd method, a sale that is not on credit, and a lost race', async () => {
    const { svc, prisma, tx } = build();
    prisma.sale.findFirst.mockResolvedValue(credit());
    await expect(svc.markCreditPaid('sale-1', BIZ, 10_001)).rejects.toThrow(/Amount paid/);
    await expect(svc.markCreditPaid('sale-1', BIZ, 100, 'barter')).rejects.toThrow(/Payment method/);
    prisma.sale.findFirst.mockResolvedValue(credit({ status: 'PAID' }));
    await expect(svc.markCreditPaid('sale-1', BIZ)).rejects.toThrow(/not a credit sale/);
    prisma.sale.findFirst.mockResolvedValue(credit());
    tx.sale.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.markCreditPaid('sale-1', BIZ)).rejects.toThrow(/just settled/);
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('getSale', () => {
  it('another business\'s sale is a 404, not an empty 200', async () => {
    const { svc, prisma } = build();
    prisma.sale.findFirst.mockResolvedValue(null);
    await expect(svc.getSale('x', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    prisma.sale.findFirst.mockResolvedValue({ id: 'x' });
    expect(await svc.getSale('x', BIZ)).toEqual({ id: 'x' });
  });
});
