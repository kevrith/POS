import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FuelPumpService } from './fuel-pump.service';
import { DirectSaleService } from '../sales/direct-sale.service';

function makeGrade(o: Record<string, any> = {}) {
  return { id: 'grade-1', businessId: 'biz-1', storeId: 'store-1', name: 'Petrol', code: 'PMS', pricePerLitreCents: 19500, isActive: true, ...o };
}
function makePump(o: Record<string, any> = {}) {
  return { id: 'pump-1', businessId: 'biz-1', storeId: 'store-1', pumpNumber: 1, label: 'Pump 1', status: 'IDLE', gradeId: 'grade-1', grade: makeGrade(), ...o };
}
function makeTank(o: Record<string, any> = {}) {
  return { id: 'tank-1', businessId: 'biz-1', storeId: 'store-1', tankNumber: 1, gradeId: 'grade-1', capacityLitres: 1000, currentLitres: 500, isActive: true, ...o };
}

/** The tx handed to the interactive transaction is the same object as the client, as with Prisma. */
function makePrisma() {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    fuelGrade: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    fuelPump: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    fuelSale: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    fuelTank: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    fuelTankDipping: { create: jest.fn(), findMany: jest.fn() },
    fuelDelivery: { create: jest.fn(), findMany: jest.fn() },
    fuelShift: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    fuelShiftReading: { updateMany: jest.fn() },
    fleetAccount: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    customer: { count: jest.fn().mockResolvedValue(1) },
    item: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    fleetTransaction: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    fuelPumpMaintenance: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  return p;
}

function setup(opts: { invoice?: boolean } = {}) {
  const prisma = makePrisma();
  const directSales = {
    isEnabled: jest.fn().mockResolvedValue(!!opts.invoice),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => ({
      sale: { id: 'sale-9', receiptNumber: 'NRB01-2026-0000009', totalCents: input.lines[0].totalCents, vatCents: 0, totCents: 0, status: input.onAccount ? 'CREDIT' : 'PAID' },
      isCredit: !!input.onAccount,
      payments: input.payments ?? [],
    })),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CN-1', qrUrl: 'https://itax.kra.go.ke/qr/1' }) }),
  };
  const ledger = { autoPost: jest.fn().mockResolvedValue(undefined) };
  const sales = {
    voidInTx: jest.fn().mockResolvedValue({ success: true, refundAmountCents: 1000, newStatus: 'VOIDED', isLineItemVoid: false, receiptNumber: 'R1', saleTotalCents: 1000, voidRecordId: 'v1' }),
    afterVoid: jest.fn().mockResolvedValue(undefined),
  };
  return { prisma, directSales, ledger, sales, svc: new FuelPumpService(prisma, directSales as unknown as DirectSaleService, ledger as any, sales as any) };
}

const SALE = { businessId: 'biz-1', pumpId: 'pump-1', litresDispensed: 10, paymentMethod: 'CASH' };
/** The [delta, account] of every update of what the books believe a fleet account owes. */
const owedCalls = (prisma: any) => prisma.$executeRaw.mock.calls
  .filter((c: any[]) => c[0].join('?').includes('ledgerOwedCents'))
  .map((c: any[]) => [c[1], c[2]]);

describe('FuelPumpService.recordSale', () => {
  function ready(tanks: any[] = [makeTank()], opts: { invoice?: boolean } = {}) {
    const ctx = setup(opts);
    ctx.prisma.fleetAccount.findFirst.mockResolvedValue({ companyName: 'Acme Logistics', kraPin: 'P051234567Z' });
    ctx.prisma.fuelPump.findFirst.mockResolvedValue(makePump());
    ctx.prisma.fuelTank.findMany.mockResolvedValue(tanks);
    ctx.prisma.fuelTank.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.fuelSale.create.mockImplementation(async ({ data }: any) => ({ id: 'sale-1', ...data }));
    ctx.prisma.fuelPump.update.mockResolvedValue({});
    return ctx;
  }

  it('charges the grade price, whatever price the request carries', async () => {
    const { svc, prisma } = ready();
    const sale: any = await svc.recordSale({ ...SALE, pricePerLitreCents: 1 });
    expect(sale.pricePerLitreCents).toBe(19500);
    expect(sale.totalCents).toBe(195000);
    expect(prisma.fuelSale.create.mock.calls[0][0].data.totalCents).toBe(195000);
  });

  it('rounds the total to a whole cent', async () => {
    const { svc } = ready();
    const sale: any = await svc.recordSale({ ...SALE, litresDispensed: 3.333 });
    expect(sale.totalCents).toBe(Math.round(3.333 * 19500));
  });

  it.each([0, -50, NaN, Infinity, 'abc', null, undefined, 5001])('rejects litres of %p before touching anything', async (litres) => {
    const { svc, prisma } = ready();
    await expect(svc.recordSale({ ...SALE, litresDispensed: litres as any })).rejects.toThrow(BadRequestException);
    expect(prisma.fuelTank.updateMany).not.toHaveBeenCalled();
    expect(prisma.fuelSale.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown payment method and a fleet sale with no account', async () => {
    const { svc } = ready();
    await expect(svc.recordSale({ ...SALE, paymentMethod: 'BARTER' })).rejects.toThrow(/Payment method/);
    await expect(svc.recordSale({ ...SALE, paymentMethod: 'FLEET' })).rejects.toThrow(/fleet account/);
  });

  it("treats another business's pump as missing", async () => {
    const { svc, prisma } = ready();
    prisma.fuelPump.findFirst.mockResolvedValue(null);
    await expect(svc.recordSale(SALE)).rejects.toThrow(NotFoundException);
    expect(prisma.fuelPump.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pump-1', businessId: 'biz-1' } }));
  });

  it('refuses a grade that is not the pump\'s', async () => {
    const { svc } = ready();
    await expect(svc.recordSale({ ...SALE, gradeId: 'diesel' })).rejects.toThrow(/different grade/);
  });

  it('takes fuel with a conditional update so two sales cannot spend the same litres', async () => {
    const { svc, prisma } = ready();
    await svc.recordSale(SALE);
    expect(prisma.fuelTank.updateMany).toHaveBeenCalledWith({
      where: { id: 'tank-1', currentLitres: { gte: 10 } },
      data: { currentLitres: { decrement: 10 } },
    });
  });

  it('refuses the sale, and records nothing, when no tank can cover it', async () => {
    const { svc, prisma } = ready();
    prisma.fuelTank.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.recordSale(SALE)).rejects.toThrow(/Insufficient fuel/);
    expect(prisma.fuelSale.create).not.toHaveBeenCalled();
    expect(prisma.fuelPump.update).not.toHaveBeenCalled();
  });

  it('falls through to a second tank of the same grade', async () => {
    const { svc, prisma } = ready([makeTank({ id: 'tank-1', currentLitres: 5 }), makeTank({ id: 'tank-2', tankNumber: 2 })]);
    prisma.fuelTank.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await svc.recordSale(SALE);
    expect(prisma.fuelTank.updateMany.mock.calls.map((c: any[]) => c[0].where.id)).toEqual(['tank-1', 'tank-2']);
    expect(prisma.fuelSale.create).toHaveBeenCalled();
  });

  it('sells normally when the grade has no tank set up', async () => {
    const { svc, prisma } = ready([]);
    await svc.recordSale(SALE);
    expect(prisma.fuelTank.updateMany).not.toHaveBeenCalled();
    expect(prisma.fuelSale.create).toHaveBeenCalled();
  });

  it('frees the pump in the same transaction', async () => {
    const { svc, prisma } = ready();
    await svc.recordSale(SALE);
    expect(prisma.fuelPump.update).toHaveBeenCalledWith({ where: { id: 'pump-1' }, data: { status: 'IDLE' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  describe('on a fleet account', () => {
    const FLEET = { ...SALE, paymentMethod: 'FLEET', fleetAccountId: 'fleet-1' };

    it('charges the account and writes the ledger row for the sale', async () => {
      const { svc, prisma } = ready();
      await svc.recordSale(FLEET);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.fleetTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ fleetAccountId: 'fleet-1', businessId: 'biz-1', type: 'CHARGE', amountCents: 195000, fuelSaleId: 'sale-1' }),
      });
    });

    it('fails the whole sale when the credit limit would be passed', async () => {
      const { svc, prisma } = ready();
      prisma.$executeRaw.mockResolvedValue(0);
      prisma.fleetAccount.findFirst
        .mockResolvedValueOnce({ companyName: 'Acme Logistics', kraPin: null })
        .mockResolvedValue({ id: 'fleet-1', isActive: true, creditLimitCents: 100000, balanceCents: 0 });
      await expect(svc.recordSale(FLEET)).rejects.toThrow(/Credit limit exceeded/);
      expect(prisma.fleetTransaction.create).not.toHaveBeenCalled();
      // The pump is only freed after the charge, so it was not reached.
      expect(prisma.fuelPump.update).not.toHaveBeenCalled();
    });

    it('says so when the account is missing or switched off', async () => {
      const { svc, prisma } = ready();
      prisma.$executeRaw.mockResolvedValue(0);
      // Not found at the first lookup.
      prisma.fleetAccount.findFirst.mockResolvedValueOnce(null);
      await expect(svc.recordSale(FLEET)).rejects.toThrow(NotFoundException);
      // Found, then the conditional charge fails and the second lookup shows it switched off.
      prisma.fleetAccount.findFirst
        .mockResolvedValueOnce({ companyName: 'Acme Logistics', kraPin: null })
        .mockResolvedValueOnce({ id: 'fleet-1', isActive: false });
      await expect(svc.recordSale(FLEET)).rejects.toThrow(/switched off/);
    });
  });
});

describe('FuelPumpService.recordSale: the invoice', () => {
  const CASH_SALE = { businessId: 'biz-1', pumpId: 'pump-1', litresDispensed: 10, paymentMethod: 'CASH', cashierId: 'user-1' };
  const GRADE_ITEM = { id: 'item-fuel', businessId: 'biz-1', taxClass: 'B' };

  function ready(opts: { invoice?: boolean; gradeItem?: any; grade?: Record<string, any> } = {}) {
    const ctx = setup({ invoice: opts.invoice });
    ctx.prisma.fuelPump.findFirst.mockResolvedValue(makePump({ grade: makeGrade({ itemId: 'item-fuel', ...(opts.grade ?? {}) }) }));
    ctx.prisma.fuelTank.findMany.mockResolvedValue([makeTank()]);
    ctx.prisma.fuelTank.updateMany.mockResolvedValue({ count: 1 });
    ctx.prisma.fuelSale.create.mockImplementation(async ({ data }: any) => ({ id: 'sale-1', ...data }));
    ctx.prisma.fuelSale.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    ctx.prisma.fuelGrade.update.mockResolvedValue({});
    ctx.prisma.fuelPump.update.mockResolvedValue({});
    ctx.prisma.fleetAccount.findFirst.mockResolvedValue({ companyName: 'Acme Logistics', kraPin: 'P051234567Z' });
    ctx.prisma.item.findFirst.mockResolvedValue(opts.gradeItem === undefined ? GRADE_ITEM : opts.gradeItem);
    ctx.prisma.item.create.mockImplementation(async ({ data }: any) => ({ id: 'item-new', ...data }));
    return ctx;
  }

  it('before cutover the sale is recorded as it always was: no invoice', async () => {
    const { svc, directSales, prisma } = ready({ invoice: false });
    const r: any = await svc.recordSale(CASH_SALE);
    expect(directSales.createInTx).not.toHaveBeenCalled();
    expect(directSales.afterCommit).not.toHaveBeenCalled();
    expect(prisma.fuelSale.updateMany).not.toHaveBeenCalled();
    expect(r.saleId).toBeUndefined();
    expect(r.receiptNumber).toBeUndefined();
    expect(r.totalCents).toBe(195000);
  });

  it('after cutover a cash sale becomes a paid Sale for the grade item, in the same transaction', async () => {
    const { svc, directSales, prisma } = ready({ invoice: true });
    const r: any = await svc.recordSale(CASH_SALE);
    const [tx, input] = directSales.createInTx.mock.calls[0];
    expect(tx).toBe(prisma);
    expect(input).toEqual(expect.objectContaining({
      businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', source: 'FUEL', onAccount: false, externalAccount: false,
      payments: [{ method: 'CASH', amountCents: 195000, reference: undefined }],
    }));
    expect(input.lines).toEqual([{ itemId: 'item-fuel', name: 'Petrol (Pump 1)', quantity: 10, unitPriceCents: 19500, totalCents: 195000, taxClass: 'B' }]);
    expect(input.notes).toMatch(/Fuel 10\.000 L, pump 1/);
    expect(prisma.fuelSale.updateMany).toHaveBeenCalledWith({ where: { id: 'sale-1', businessId: 'biz-1' }, data: { saleId: 'sale-9' } });
    expect(r).toEqual(expect.objectContaining({ saleId: 'sale-9', receiptNumber: 'NRB01-2026-0000009' }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns the receipt number, the invoice and the KRA answer for the receipt', async () => {
    const { svc } = ready({ invoice: true });
    const r: any = await svc.recordSale(CASH_SALE);
    expect(r.invoice).toEqual(expect.objectContaining({ id: 'sale-9', receiptNumber: 'NRB01-2026-0000009' }));
    expect(r.etims).toEqual({ success: true, controlNumber: 'CN-1', qrUrl: 'https://itax.kra.go.ke/qr/1' });
  });

  it('a KRA that has not answered in a few seconds does not hold the pump: the sale returns without the QR', async () => {
    jest.useFakeTimers();
    try {
      const { svc, directSales } = ready({ invoice: true });
      directSales.afterCommit.mockReturnValue({ etims: new Promise(() => undefined) });
      const pending = svc.recordSale(CASH_SALE);
      await jest.advanceTimersByTimeAsync(5001);
      const r: any = await pending;
      expect(r.etims).toBeNull();
      expect(r.receiptNumber).toBe('NRB01-2026-0000009');
    } finally {
      jest.useRealTimers();
    }
  });

  it('only after the transaction commits does the post-commit work run', async () => {
    const { svc, directSales, prisma } = ready({ invoice: true });
    let committed = false;
    prisma.$transaction.mockImplementation(async (fn: any) => { const out = await fn(prisma); committed = true; return out; });
    directSales.afterCommit.mockImplementation(() => { expect(committed).toBe(true); return { etims: Promise.resolve(null) }; });
    await svc.recordSale(CASH_SALE);
    expect(directSales.afterCommit).toHaveBeenCalledTimes(1);
  });

  it('uses the grade item\'s tax class', async () => {
    const { svc, directSales } = ready({ invoice: true, gradeItem: { id: 'item-fuel', taxClass: 'C' } });
    await svc.recordSale(CASH_SALE);
    expect(directSales.createInTx.mock.calls[0][1].lines[0].taxClass).toBe('C');
  });

  it('makes the grade item on the first sale: inactive, standard-rated, and linked back to the grade', async () => {
    const { svc, prisma, directSales } = ready({ invoice: true, grade: { itemId: null }, gradeItem: null });
    await svc.recordSale(CASH_SALE);
    expect(prisma.item.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      businessId: 'biz-1', storeId: 'store-1', name: 'Petrol (fuel, per litre)', retailPriceCents: 19500, trackStock: false, isActive: false, taxClass: 'B', unitLabel: 'L',
    }));
    expect(prisma.fuelGrade.update).toHaveBeenCalledWith({ where: { id: 'grade-1' }, data: { itemId: 'item-new' } });
    expect(directSales.createInTx.mock.calls[0][1].lines[0].itemId).toBe('item-new');
  });

  it('reuses the grade item afterwards', async () => {
    const { svc, prisma } = ready({ invoice: true });
    await svc.recordSale(CASH_SALE);
    expect(prisma.item.create).not.toHaveBeenCalled();
  });

  it('passes M-Pesa through with its reference', async () => {
    const { svc, directSales } = ready({ invoice: true });
    await svc.recordSale({ ...CASH_SALE, paymentMethod: 'MPESA', paymentRef: 'QWE123' });
    expect(directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'MPESA', amountCents: 195000, reference: 'QWE123' }]);
  });

  it('a fleet sale is an on-account invoice to the fleet company, with its KRA PIN as buyer', async () => {
    const { svc, directSales, prisma } = ready({ invoice: true });
    await svc.recordSale({ ...CASH_SALE, paymentMethod: 'FLEET', fleetAccountId: 'fleet-1', vehiclePlate: 'kda 123x' });
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input).toEqual(expect.objectContaining({ onAccount: true, externalAccount: true, payments: [], customerName: 'Acme Logistics', buyerKraPin: 'P051234567Z' }));
    expect(input.customerId).toBeUndefined();
    expect(input.notes).toMatch(/KDA 123X/);
    // The receivable it creates is remembered, so a later switch-on only books what changed.
    expect(owedCalls(prisma)).toEqual([[195000, 'fleet-1']]);
  });

  it('a credit sale is on account to the registered customer', async () => {
    const { svc, directSales } = ready({ invoice: true });
    await svc.recordSale({ ...CASH_SALE, paymentMethod: 'CREDIT', customerId: 'cust-1' });
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input).toEqual(expect.objectContaining({ onAccount: true, externalAccount: false, customerId: 'cust-1', payments: [] }));
  });

  it('credit needs a registered customer, with or without the cutover', async () => {
    for (const invoice of [false, true]) {
      const { svc, prisma, directSales } = ready({ invoice });
      await expect(svc.recordSale({ ...CASH_SALE, paymentMethod: 'CREDIT' })).rejects.toThrow(/registered customer/);
      prisma.customer.count.mockResolvedValue(0);
      await expect(svc.recordSale({ ...CASH_SALE, paymentMethod: 'CREDIT', customerId: 'theirs' })).rejects.toThrow(/Customer not found/);
      expect(directSales.createInTx).not.toHaveBeenCalled();
      expect(prisma.fuelTank.updateMany).not.toHaveBeenCalled();
    }
  });

  it('if the invoice cannot be written the sale is refused, and nothing after it runs', async () => {
    const { svc, directSales, prisma } = ready({ invoice: true });
    directSales.createInTx.mockRejectedValue(new BadRequestException('Credit limit exceeded'));
    await expect(svc.recordSale({ ...CASH_SALE, paymentMethod: 'CREDIT', customerId: 'cust-1' })).rejects.toThrow(/Credit limit exceeded/);
    expect(directSales.afterCommit).not.toHaveBeenCalled();
    expect(prisma.fuelPump.update).not.toHaveBeenCalled();
  });
});

describe('FuelPumpService fleet and grade changes', () => {
  it('a fleet payment is posted to the books after cutover: money in, receivable cleared', async () => {
    const { svc, prisma, ledger } = setup({ invoice: true });
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'fleet-1', companyName: 'Acme Logistics' });
    prisma.fleetTransaction.create.mockResolvedValue({ id: 'tx-12345678' });
    prisma.fleetAccount.update.mockResolvedValue({});
    await svc.recordFleetPayment({ businessId: 'biz-1', fleetAccountId: 'fleet-1', amountCents: 500000, method: 'mpesa', reference: 'QWE9' });
    await new Promise((r) => setImmediate(r));
    expect(owedCalls(prisma)).toEqual([[500000, 'fleet-1']]);
    const posted = ledger.autoPost.mock.calls[0][0];
    expect(posted).toEqual(expect.objectContaining({ businessId: 'biz-1', reference: 'QWE9', sourceType: 'FLEET_PAYMENT' }));
    expect(posted.lines).toEqual([
      { accountCode: '1010', accountName: 'M-Pesa Control', debitCents: 500000, creditCents: 0 },
      { accountCode: '1200', accountName: 'Accounts Receivable', debitCents: 0, creditCents: 500000 },
    ]);
  });

  it('before cutover a fleet payment is recorded only on the account, as before', async () => {
    const { svc, prisma, ledger } = setup({ invoice: false });
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'fleet-1', companyName: 'Acme' });
    prisma.fleetTransaction.create.mockResolvedValue({ id: 'tx-1' });
    prisma.fleetAccount.update.mockResolvedValue({});
    await svc.recordFleetPayment({ businessId: 'biz-1', fleetAccountId: 'fleet-1', amountCents: 1000 });
    await new Promise((r) => setImmediate(r));
    expect(ledger.autoPost).not.toHaveBeenCalled();
    expect(owedCalls(prisma)).toEqual([]);
  });

  it('a fleet payment takes a known method only', async () => {
    const { svc, prisma } = setup();
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'fleet-1' });
    await expect(svc.recordFleetPayment({ businessId: 'biz-1', fleetAccountId: 'fleet-1', amountCents: 100, method: 'BARTER' })).rejects.toThrow(/Payment method/);
  });

  it('a fleet account\'s KRA PIN is checked and kept in capitals', async () => {
    const { svc, prisma } = setup();
    prisma.fleetAccount.create.mockImplementation(async ({ data }: any) => data);
    const ok: any = await svc.createFleetAccount({ businessId: 'biz-1', companyName: 'Acme', creditLimitCents: 0, kraPin: 'p051234567z' } as any);
    expect(ok.kraPin).toBe('P051234567Z');
    for (const bad of ['12345', 'P05123456Z', 'X051234567Z', 'P051234567']) {
      await expect(svc.createFleetAccount({ businessId: 'biz-1', companyName: 'Acme', creditLimitCents: 0, kraPin: bad } as any)).rejects.toThrow(/KRA PIN/);
    }
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.fleetAccount.update.mockResolvedValue({});
    await svc.updateFleetAccount('f1', 'biz-1', { kraPin: '' });
    expect(prisma.fleetAccount.update.mock.calls[0][0].data.kraPin).toBeNull();
  });

  it('changing a grade price moves its catalogue item with it', async () => {
    const { svc, prisma } = setup();
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade({ itemId: 'item-fuel' }));
    prisma.fuelGrade.update.mockResolvedValue(makeGrade({ itemId: 'item-fuel', pricePerLitreCents: 21000 }));
    await svc.updateGrade('grade-1', 'biz-1', { pricePerLitreCents: 21000 });
    expect(prisma.item.updateMany).toHaveBeenCalledWith({ where: { id: 'item-fuel', businessId: 'biz-1' }, data: { retailPriceCents: 21000 } });
  });

  it('a grade with no item yet, or a change that is not the price, touches no item', async () => {
    const { svc, prisma } = setup();
    prisma.fuelGrade.update.mockResolvedValue(makeGrade());
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade({ itemId: null }));
    await svc.updateGrade('grade-1', 'biz-1', { pricePerLitreCents: 21000 });
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade({ itemId: 'item-fuel' }));
    await svc.updateGrade('grade-1', 'biz-1', { name: 'Renamed' });
    expect(prisma.item.updateMany).not.toHaveBeenCalled();
  });
});

describe('FuelPumpService ownership and field whitelists', () => {
  it("treats another business's grade, tank, shift and fleet account as missing", async () => {
    const { svc, prisma } = setup();
    prisma.fuelGrade.findFirst.mockResolvedValue(null);
    prisma.fuelTank.findFirst.mockResolvedValue(null);
    prisma.fuelShift.findFirst.mockResolvedValue(null);
    prisma.fleetAccount.findFirst.mockResolvedValue(null);
    await expect(svc.updateGrade('g', 'biz-1', { pricePerLitreCents: 1 })).rejects.toThrow(NotFoundException);
    await expect(svc.getDippings('biz-1', 't')).rejects.toThrow(NotFoundException);
    await expect(svc.getFleetTransactions('biz-1', 'f')).rejects.toThrow(NotFoundException);
    await expect(svc.getShiftSummary('s', 'biz-1')).rejects.toThrow(NotFoundException);
    await expect(svc.recordFleetPayment({ businessId: 'biz-1', fleetAccountId: 'f', amountCents: 5 })).rejects.toThrow(NotFoundException);
    expect(prisma.fuelGrade.update).not.toHaveBeenCalled();
  });

  it('refuses to create anything inside a store of another business', async () => {
    const { svc, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(svc.createGrade({ businessId: 'biz-1', storeId: 'theirs', name: 'x', code: 'x', pricePerLitreCents: 100 })).rejects.toThrow(/Store not found/);
    expect(prisma.fuelGrade.create).not.toHaveBeenCalled();
  });

  it('rejects a price of zero, a negative price and a silly one', async () => {
    const { svc, prisma } = setup();
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade());
    for (const price of [0, -5, 1.5, 100001, 'free']) {
      await expect(svc.updateGrade('grade-1', 'biz-1', { pricePerLitreCents: price as any })).rejects.toThrow(BadRequestException);
    }
    expect(prisma.fuelGrade.update).not.toHaveBeenCalled();
  });

  it('a fleet account update cannot touch the balance', async () => {
    const { svc, prisma } = setup();
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'f1', businessId: 'biz-1' });
    prisma.fleetAccount.update.mockResolvedValue({});
    await svc.updateFleetAccount('f1', 'biz-1', { creditLimitCents: 5000, balanceCents: 999999, businessId: 'other' } as any);
    expect(prisma.fleetAccount.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { creditLimitCents: 5000 } });
  });

  it('a tank update cannot set the current level', async () => {
    const { svc, prisma } = setup();
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank());
    prisma.fuelTank.update.mockResolvedValue({});
    await svc.updateTank('tank-1', 'biz-1', { label: 'Main', currentLitres: 99999 } as any);
    expect(prisma.fuelTank.update.mock.calls[0][0].data).toEqual({ label: 'Main' });
  });

  it('a fleet payment must be a positive whole amount', async () => {
    const { svc, prisma } = setup();
    prisma.fleetAccount.findFirst.mockResolvedValue({ id: 'f1' });
    for (const amountCents of [0, -100, 1.5, NaN, 'x']) {
      await expect(svc.recordFleetPayment({ businessId: 'biz-1', fleetAccountId: 'f1', amountCents: amountCents as any })).rejects.toThrow(BadRequestException);
    }
  });
});

describe('FuelPumpService.authorizePump', () => {
  it('claims an idle pump with a conditional update', async () => {
    const { svc, prisma } = setup();
    prisma.fuelPump.findFirst.mockResolvedValue(makePump());
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade());
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank());
    prisma.fuelPump.updateMany.mockResolvedValue({ count: 1 });
    await svc.authorizePump('pump-1', 'biz-1');
    expect(prisma.fuelPump.updateMany).toHaveBeenCalledWith({ where: { id: 'pump-1', businessId: 'biz-1', status: 'IDLE' }, data: { status: 'AUTHORIZED' } });
  });

  it('refuses a busy pump, an empty tank and a lost race', async () => {
    const { svc, prisma } = setup();
    prisma.fuelGrade.findFirst.mockResolvedValue(makeGrade());
    prisma.fuelPump.findFirst.mockResolvedValue(makePump({ status: 'DISPENSING' }));
    await expect(svc.authorizePump('pump-1', 'biz-1')).rejects.toThrow(/DISPENSING/);

    prisma.fuelPump.findFirst.mockResolvedValue(makePump());
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank({ currentLitres: 0 }));
    await expect(svc.authorizePump('pump-1', 'biz-1')).rejects.toThrow(/empty/);

    prisma.fuelTank.findFirst.mockResolvedValue(makeTank());
    prisma.fuelPump.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.authorizePump('pump-1', 'biz-1')).rejects.toThrow(/someone else/);
  });
});

describe('FuelPumpService tanks', () => {
  it('rejects a dipping above the tank capacity or below zero', async () => {
    const { svc, prisma } = setup();
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank());
    for (const litres of [1001, -1, NaN]) {
      await expect(svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres, recordedBy: 'Ann' })).rejects.toThrow(BadRequestException);
    }
    expect(prisma.fuelTankDipping.create).not.toHaveBeenCalled();
  });

  it('adds a delivery that fits, as an increment rather than an overwrite', async () => {
    const { svc, prisma } = setup();
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank({ currentLitres: 500 }));
    prisma.fuelDelivery.create.mockResolvedValue({ id: 'd1' });
    prisma.fuelTank.update.mockResolvedValue({});
    await svc.recordDelivery({ businessId: 'biz-1', tankId: 'tank-1', litresDelivered: 400 });
    expect(prisma.fuelTank.update).toHaveBeenCalledWith({ where: { id: 'tank-1' }, data: { currentLitres: { increment: 400 } } });
  });

  it('refuses a delivery bigger than the room on the books instead of capping it silently', async () => {
    const { svc, prisma } = setup();
    prisma.fuelTank.findFirst.mockResolvedValue(makeTank({ currentLitres: 900 }));
    await expect(svc.recordDelivery({ businessId: 'biz-1', tankId: 'tank-1', litresDelivered: 400 })).rejects.toThrow(/does not fit/);
    for (const litresDelivered of [0, -10, NaN]) {
      await expect(svc.recordDelivery({ businessId: 'biz-1', tankId: 'tank-1', litresDelivered })).rejects.toThrow(BadRequestException);
    }
    expect(prisma.fuelDelivery.create).not.toHaveBeenCalled();
  });
});

describe('FuelPumpService shifts', () => {
  const openShift = (o: Record<string, any> = {}) => ({
    id: 'shift-1', businessId: 'biz-1', storeId: 'store-1', status: 'OPEN',
    readings: [{ pumpId: 'pump-1', openingLitres: 100 }], ...o,
  });

  it('will not open a second shift while one is open', async () => {
    const { svc, prisma } = setup();
    prisma.fuelPump.count.mockResolvedValue(1);
    prisma.fuelShift.findFirst.mockResolvedValue(openShift());
    await expect(svc.openShift({ businessId: 'biz-1', storeId: 'store-1', cashierName: 'Ann', readings: [{ pumpId: 'pump-1', openingLitres: 0 }] })).rejects.toThrow(/already open/);
    expect(prisma.fuelShift.create).not.toHaveBeenCalled();
  });

  it('rejects readings for pumps outside the store, duplicates and negatives', async () => {
    const { svc, prisma } = setup();
    prisma.fuelPump.count.mockResolvedValue(0);
    await expect(svc.openShift({ businessId: 'biz-1', storeId: 'store-1', cashierName: 'Ann', readings: [{ pumpId: 'x', openingLitres: 0 }] })).rejects.toThrow(/not in this store/);
    await expect(svc.openShift({ businessId: 'biz-1', storeId: 'store-1', cashierName: 'Ann', readings: [{ pumpId: 'x', openingLitres: 0 }, { pumpId: 'x', openingLitres: 1 }] })).rejects.toThrow(/only one/);
    await expect(svc.openShift({ businessId: 'biz-1', storeId: 'store-1', cashierName: 'Ann', readings: [{ pumpId: 'x', openingLitres: -4 }] })).rejects.toThrow(BadRequestException);
  });

  it('closes an open shift and stores the closing readings', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(openShift());
    prisma.fuelShift.updateMany.mockResolvedValue({ count: 1 });
    prisma.fuelShiftReading.updateMany.mockResolvedValue({ count: 1 });
    await svc.closeShift('shift-1', 'biz-1', [{ pumpId: 'pump-1', closingLitres: 250 }]);
    expect(prisma.fuelShift.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'shift-1', businessId: 'biz-1', status: 'OPEN' } }));
    expect(prisma.fuelShiftReading.updateMany).toHaveBeenCalledWith({ where: { shiftId: 'shift-1', pumpId: 'pump-1' }, data: { closingLitres: 250 } });
  });

  it('refuses a second close, a lost race and bad readings', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(openShift({ status: 'CLOSED' }));
    await expect(svc.closeShift('shift-1', 'biz-1', [])).rejects.toThrow(/already closed/);

    prisma.fuelShift.findFirst.mockResolvedValue(openShift());
    prisma.fuelShift.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.closeShift('shift-1', 'biz-1', [])).rejects.toThrow(/already closed/);

    await expect(svc.closeShift('shift-1', 'biz-1', [{ pumpId: 'other', closingLitres: 5 }])).rejects.toThrow(/not in this shift/);
    await expect(svc.closeShift('shift-1', 'biz-1', [{ pumpId: 'pump-1', closingLitres: 50 }])).rejects.toThrow(BadRequestException); // below the 100 opening
    expect(prisma.fuelShiftReading.updateMany).not.toHaveBeenCalled();
  });
});

describe('FuelPumpService.getSaleStats', () => {
  it('returns totalRevenueCents and the by-grade breakdown', async () => {
    const { svc, prisma } = setup();
    prisma.fuelSale.aggregate.mockResolvedValue({ _sum: { totalCents: 500000, litresDispensed: 25 }, _count: 3 });
    prisma.fuelSale.groupBy.mockResolvedValue([{ gradeId: 'grade-1', _sum: { totalCents: 500000, litresDispensed: 25 }, _count: 3 }]);
    prisma.fuelGrade.findMany.mockResolvedValue([makeGrade()]);
    const result = await svc.getSaleStats('biz-1', 'store-1');
    expect(result.totalRevenueCents).toBe(500000);
    expect(result.byGrade[0].gradeName).toBe('Petrol');
  });
});


describe('FuelPumpService.voidSale', () => {
  const MANAGER = { id: 'u-mgr', name: 'Grace', role: 'MANAGER' };
  const sold = (o: Record<string, any> = {}) => ({ id: 'fs-1', businessId: 'biz-1', storeId: 'store-1', gradeId: 'grade-1', status: 'COMPLETED', litresDispensed: 10, totalCents: 195000, paymentMethod: 'CASH', tankId: 'tank-1', saleId: null, ...o });
  function ready(sale = sold()) {
    const ctx = setup();
    ctx.prisma.fuelSale.findFirst.mockResolvedValue(sale);
    return ctx;
  }

  it('is a manager decision', async () => {
    const { svc, prisma } = ready();
    await expect(svc.voidSale('fs-1', 'biz-1', { id: 'u1', name: 'Pat', role: 'CASHIER' }, 'oops')).rejects.toThrow(/manager/);
    expect(prisma.fuelSale.updateMany).not.toHaveBeenCalled();
  });

  it('puts the litres back in the tank they came from', async () => {
    const { svc, prisma } = ready();
    await svc.voidSale('fs-1', 'biz-1', MANAGER, 'wrong pump');
    expect(prisma.fuelSale.updateMany).toHaveBeenCalledWith({ where: { id: 'fs-1', businessId: 'biz-1', status: 'COMPLETED' }, data: expect.objectContaining({ status: 'VOIDED', voidedBy: 'Grace', voidReason: 'wrong pump' }) });
    expect(prisma.fuelTank.updateMany).toHaveBeenCalledWith({ where: { id: 'tank-1', businessId: 'biz-1' }, data: { currentLitres: { increment: 10 } } });
  });

  it('a sale from before the tank was kept goes to the first tank with room', async () => {
    const { svc, prisma } = ready(sold({ tankId: null }));
    prisma.fuelTank.findMany.mockResolvedValue([makeTank({ id: 't-full', currentLitres: 995 }), makeTank({ id: 't-room', tankNumber: 2, currentLitres: 100 })]);
    await svc.voidSale('fs-1', 'biz-1', MANAGER, 'oops');
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].where.id).toBe('t-room');
  });

  it('credits a fleet account with what the sale charged it', async () => {
    const { svc, prisma } = ready(sold({ paymentMethod: 'FLEET' }));
    prisma.fleetTransaction.findFirst.mockResolvedValue({ fleetAccountId: 'fa-1', amountCents: 195000 });
    await svc.voidSale('fs-1', 'biz-1', MANAGER, 'oops');
    expect(prisma.fleetAccount.updateMany).toHaveBeenCalledWith({ where: { id: 'fa-1', businessId: 'biz-1' }, data: { balanceCents: { increment: 195000 } } });
    expect(prisma.fleetTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'VOID', amountCents: 195000, fuelSaleId: 'fs-1' }) });
    expect(owedCalls(prisma)).toEqual([]); // no invoice, so nothing in receivables to take back
  });

  it('a fleet sale that was invoiced takes its receivable back out of what the books believe is owed', async () => {
    const { svc, prisma } = ready(sold({ paymentMethod: 'FLEET', saleId: 'sale-9' }));
    prisma.fleetTransaction.findFirst.mockResolvedValue({ fleetAccountId: 'fa-1', amountCents: 195000 });
    await svc.voidSale('fs-1', 'biz-1', MANAGER, 'oops');
    expect(owedCalls(prisma)).toEqual([[-195000, 'fa-1']]);
  });

  it('voids the invoice in the same transaction, and tells the books and KRA after it commits', async () => {
    const { svc, sales } = ready(sold({ saleId: 'sale-9' }));
    await svc.voidSale('fs-1', 'biz-1', MANAGER, 'oops');
    expect(sales.voidInTx).toHaveBeenCalledWith(expect.anything(), 'sale-9', 'biz-1', 'u-mgr', 'Fuel sale voided: oops');
    expect(sales.afterVoid).toHaveBeenCalledTimes(1);
  });

  it('a failed invoice void leaves nothing changed, and nothing is announced', async () => {
    const { svc, sales } = ready(sold({ saleId: 'sale-9' }));
    sales.voidInTx.mockRejectedValue(new BadRequestException('Can only void paid sales'));
    await expect(svc.voidSale('fs-1', 'biz-1', MANAGER, 'oops')).rejects.toThrow(/paid sales/);
    expect(sales.afterVoid).not.toHaveBeenCalled();
  });

  it('will not void twice, and loses a race cleanly', async () => {
    const done = ready(sold({ status: 'VOIDED' }));
    await expect(done.svc.voidSale('fs-1', 'biz-1', MANAGER, 'again')).rejects.toThrow(/already voided/);
    const race = ready();
    race.prisma.fuelSale.updateMany.mockResolvedValue({ count: 0 });
    await expect(race.svc.voidSale('fs-1', 'biz-1', MANAGER, 'again')).rejects.toThrow(/already voided/);
    expect(race.prisma.fuelTank.updateMany).not.toHaveBeenCalled();
  });

  it('needs a reason, and treats another business\'s sale as missing', async () => {
    const { svc, prisma } = ready();
    await expect(svc.voidSale('fs-1', 'biz-1', MANAGER, '  ')).rejects.toBeInstanceOf(BadRequestException);
    prisma.fuelSale.findFirst.mockResolvedValue(null);
    await expect(svc.voidSale('fs-1', 'biz-2', MANAGER, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
