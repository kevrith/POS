import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DirectSaleService, type DirectSaleInput } from './direct-sale.service';

function setup(over: { taxType?: string; customer?: any } = {}) {
  const tx: any = {
    store: {
      findFirst: jest.fn().mockResolvedValue({ id: 'store-1', business: { taxType: over.taxType ?? 'VAT', totRate: 3 } }),
      update: jest.fn().mockResolvedValue({ storeCode: 'NRB01', receiptSequence: 12 }),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(over.customer ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    sale: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'sale-1', ...data, items: data.items.create, payments: data.payments.create })) },
  };
  const prisma: any = { business: { findUnique: jest.fn() } };
  const ledger = { autoPost: jest.fn().mockResolvedValue(undefined) };
  const etims = { submitSale: jest.fn().mockResolvedValue({ success: true }) };
  const audit = { createEntry: jest.fn().mockResolvedValue(undefined) };
  const events = { emitSaleCreated: jest.fn() };
  const svc = new DirectSaleService(prisma, ledger as any, etims as any, audit as any, events as any);
  return { svc, tx, prisma, ledger, etims, audit, events };
}

const LINE = { itemId: 'item-1', name: 'Super Petrol', quantity: 10, unitPriceCents: 20000, totalCents: 200000, taxClass: 'B' as const };
const input = (o: Partial<DirectSaleInput> = {}): DirectSaleInput => ({
  businessId: 'biz-1', storeId: 'store-1', cashierId: 'user-1', source: 'FUEL',
  lines: [LINE], payments: [{ method: 'CASH', amountCents: 200000 }], ...o,
});
const written = (tx: any) => tx.sale.create.mock.calls[0][0].data;

describe('DirectSaleService.settleTender', () => {
  const settle = DirectSaleService.settleTender;

  it('records exactly the sale total when paid in exact cash', () => {
    expect(settle(5000, [{ method: 'cash', amountCents: 5000 }])).toEqual([{ method: 'CASH', amountCents: 5000 }]);
  });

  it('takes the change off the cash, so takings are not overstated by every large note', () => {
    expect(settle(11600, [{ method: 'CASH', amountCents: 20000 }])).toEqual([{ method: 'CASH', amountCents: 11600 }]);
  });

  it('takes change off cash only: a split payment keeps its M-Pesa part whole', () => {
    expect(settle(10000, [{ method: 'MPESA', amountCents: 4000 }, { method: 'CASH', amountCents: 10000 }]))
      .toEqual([{ method: 'MPESA', amountCents: 4000 }, { method: 'CASH', amountCents: 6000 }]);
  });

  it('refuses an overpayment that cash cannot absorb', () => {
    expect(() => settle(5000, [{ method: 'CARD', amountCents: 8000 }])).toThrow(/Change can only be given on cash/);
    expect(() => settle(5000, [{ method: 'CARD', amountCents: 5000 }, { method: 'CASH', amountCents: 100 }, { method: 'MPESA', amountCents: 9000 }])).toThrow(/Change can only be given on cash/);
  });

  it('refuses a short payment', () => {
    expect(() => settle(5000, [{ method: 'CASH', amountCents: 4999 }])).toThrow(/do not cover/);
    expect(() => settle(5000, [])).toThrow(/do not cover/);
  });

  it('a free sale needs no payment', () => {
    expect(settle(0, [])).toEqual([]);
  });

  it('rejects zero, negative, fractional and method-less payments', () => {
    for (const amountCents of [0, -5, 1.5, NaN]) {
      expect(() => settle(100, [{ method: 'CASH', amountCents }])).toThrow(BadRequestException);
    }
    expect(() => settle(100, [{ method: '  ', amountCents: 100 }])).toThrow(/method/);
  });
});

describe('DirectSaleService.createInTx', () => {
  it('writes a paid sale with a receipt number, per-line tax and the payment', async () => {
    const { svc, tx } = setup();
    const r = await svc.createInTx(tx, input());
    const d = written(tx);
    expect(d.receiptNumber).toBe(`NRB01-${new Date().getFullYear()}-0000012`);
    expect(d).toEqual(expect.objectContaining({ type: 'NORMAL', status: 'PAID', totalCents: 200000, subtotalCents: 200000, vatCents: 27586, taxClassified: true, cashierId: 'user-1' }));
    expect(d.items.create[0]).toEqual(expect.objectContaining({ itemId: 'item-1', quantity: 10, taxClass: 'B', vatCents: 27586, discountCents: 0 }));
    expect(d.payments.create).toEqual([expect.objectContaining({ method: 'CASH', amountCents: 200000 })]);
    expect(r.isCredit).toBe(false);
  });

  it('takes the receipt number from an atomic increment of the store sequence', async () => {
    const { svc, tx } = setup();
    await svc.createInTx(tx, input());
    expect(tx.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { receiptSequence: { increment: 1 } } });
  });

  it('records the change-adjusted payment, not the tender', async () => {
    const { svc, tx } = setup();
    await svc.createInTx(tx, input({ payments: [{ method: 'CASH', amountCents: 500000 }] }));
    expect(written(tx).payments.create[0].amountCents).toBe(200000);
  });

  it('charges no VAT on exempt lines, and no VAT at all for a non-VAT business', async () => {
    const a = setup();
    await a.svc.createInTx(a.tx, input({ lines: [{ ...LINE, taxClass: 'A', totalCents: 20000, unitPriceCents: 2000 }], payments: [{ method: 'CASH', amountCents: 20000 }] }));
    expect(written(a.tx).vatCents).toBe(0);
    const b = setup({ taxType: 'NONE' });
    await b.svc.createInTx(b.tx, input());
    expect(written(b.tx).vatCents).toBe(0);
    expect(written(b.tx).items.create[0].taxClass).toBe('D');
  });

  it('works out TOT for a TOT business', async () => {
    const { svc, tx } = setup({ taxType: 'TOT' });
    await svc.createInTx(tx, input());
    expect(written(tx).vatCents).toBe(0);
    expect(written(tx).totCents).toBe(Math.round((200000 * 3) / 103));
  });

  it('shares a discount across the lines and lowers the total', async () => {
    const { svc, tx } = setup();
    await svc.createInTx(tx, input({ discountCents: 10000, payments: [{ method: 'CASH', amountCents: 190000 }] }));
    const d = written(tx);
    expect(d.totalCents).toBe(190000);
    expect(d.items.create[0].discountCents).toBe(10000);
  });

  it('rejects a discount larger than the sale, empty lines and non-positive quantities', async () => {
    const { svc, tx } = setup();
    await expect(svc.createInTx(tx, input({ discountCents: 200001 }))).rejects.toThrow(/larger than the sale/);
    await expect(svc.createInTx(tx, input({ lines: [] }))).rejects.toThrow(/at least one line/);
    await expect(svc.createInTx(tx, input({ lines: [{ ...LINE, quantity: 0 }] }))).rejects.toThrow(/greater than zero/);
    await expect(svc.createInTx(tx, input({ lines: [{ ...LINE, totalCents: 10.5 }] }))).rejects.toThrow(/whole cents/);
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('a store of another business is missing', async () => {
    const { svc, tx } = setup();
    tx.store.findFirst.mockResolvedValue(null);
    await expect(svc.createInTx(tx, input())).rejects.toThrow(NotFoundException);
    expect(tx.store.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'store-1', businessId: 'biz-1' } }));
  });

  describe('on account', () => {
    it('an external account (a fleet) makes a CREDIT sale with no payment and no customer debit', async () => {
      const { svc, tx } = setup();
      const r = await svc.createInTx(tx, input({ onAccount: true, externalAccount: true, payments: [], customerName: 'Acme Logistics', buyerKraPin: 'P051234567Z' }));
      const d = written(tx);
      expect(d).toEqual(expect.objectContaining({ type: 'CREDIT', status: 'CREDIT', customerName: 'Acme Logistics', buyerKraPin: 'P051234567Z' }));
      expect(d.payments.create).toEqual([]);
      expect(tx.customer.update).not.toHaveBeenCalled();
      expect(r.isCredit).toBe(true);
    });

    it('a registered customer is debited, within their credit limit', async () => {
      const { svc, tx } = setup({ customer: { id: 'c1', creditLimitCents: 500000, balanceCents: -100000 } });
      await svc.createInTx(tx, input({ onAccount: true, customerId: 'c1', payments: [] }));
      expect(tx.customer.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { balanceCents: { decrement: 200000 } } });
      expect(written(tx).customerId).toBe('c1');
    });

    it('refuses a sale that would pass the customer\'s credit limit, debiting nothing', async () => {
      const { svc, tx } = setup({ customer: { id: 'c1', creditLimitCents: 250000, balanceCents: -100000 } });
      await expect(svc.createInTx(tx, input({ onAccount: true, customerId: 'c1', payments: [] }))).rejects.toThrow(/Credit limit exceeded/);
      expect(tx.customer.update).not.toHaveBeenCalled();
      expect(tx.sale.create).not.toHaveBeenCalled();
    });

    it('a limit of 0 means no limit has been set', async () => {
      const { svc, tx } = setup({ customer: { id: 'c1', creditLimitCents: 0, balanceCents: -9_999_999 } });
      await expect(svc.createInTx(tx, input({ onAccount: true, customerId: 'c1', payments: [] }))).resolves.toBeTruthy();
    });

    it('needs a registered customer or an external account, and takes no payment', async () => {
      const { svc, tx } = setup();
      await expect(svc.createInTx(tx, input({ onAccount: true, payments: [] }))).rejects.toThrow(/registered customer/);
      await expect(svc.createInTx(tx, input({ onAccount: true, externalAccount: true }))).rejects.toThrow(/takes no payment/);
      tx.customer.findFirst.mockResolvedValue(null);
      await expect(svc.createInTx(tx, input({ onAccount: true, customerId: 'theirs', payments: [] }))).rejects.toThrow(/Customer not found/);
    });
  });
});

describe('DirectSaleService.isEnabled', () => {
  it('is off until the cutover date has passed', async () => {
    const { svc, prisma } = setup();
    prisma.business.findUnique.mockResolvedValue({ verticalSalesFrom: null });
    expect(await svc.isEnabled('biz-1')).toBe(false);
    prisma.business.findUnique.mockResolvedValue({ verticalSalesFrom: new Date(Date.now() + 86_400_000) });
    expect(await svc.isEnabled('biz-1')).toBe(false);
    prisma.business.findUnique.mockResolvedValue({ verticalSalesFrom: new Date(Date.now() - 1000) });
    expect(await svc.isEnabled('biz-1')).toBe(true);
    prisma.business.findUnique.mockResolvedValue(null);
    expect(await svc.isEnabled('missing')).toBe(false);
  });
});

describe('DirectSaleService.afterCommit', () => {
  const flush = () => new Promise((r) => setImmediate(r));

  it('audits, posts the books, broadcasts and submits to KRA', async () => {
    const { svc, tx, audit, ledger, etims, events } = setup();
    const result = await svc.createInTx(tx, input());
    svc.afterCommit(result, input());
    await flush();
    expect(audit.createEntry).toHaveBeenCalledWith(expect.objectContaining({ action: 'SALE_CREATED', entity: 'Sale', entityId: 'sale-1', source: 'FUEL' }));
    expect(ledger.autoPost).toHaveBeenCalledTimes(1);
    const posted = ledger.autoPost.mock.calls[0][0];
    expect(posted.sourceType).toBe('SALE');
    expect(posted.lines.reduce((s: number, l: any) => s + l.debitCents, 0)).toBe(posted.lines.reduce((s: number, l: any) => s + l.creditCents, 0));
    expect(posted.lines.find((l: any) => l.accountCode === '1000')?.debitCents).toBe(200000);
    expect(posted.lines.find((l: any) => l.accountCode === '2100')?.creditCents).toBe(27586);
    expect(events.emitSaleCreated).toHaveBeenCalledWith('biz-1', expect.objectContaining({ saleId: 'sale-1', totalCents: 200000 }));
    expect(etims.submitSale).toHaveBeenCalledWith('sale-1');
  });

  it('an on-account sale debits receivables in the books, not cash', async () => {
    const { svc, tx, ledger } = setup();
    const inp = input({ onAccount: true, externalAccount: true, payments: [] });
    svc.afterCommit(await svc.createInTx(tx, inp), inp);
    await flush();
    const lines = ledger.autoPost.mock.calls[0][0].lines;
    expect(lines.find((l: any) => l.accountCode === '1200')?.debitCents).toBe(200000);
    expect(lines.find((l: any) => l.accountCode === '1000')).toBeUndefined();
  });

  it('hands back what KRA answered, and null when KRA could not be reached', async () => {
    const { svc, tx, etims } = setup();
    const result = await svc.createInTx(tx, input());
    etims.submitSale.mockResolvedValue({ success: true, controlNumber: 'CN-7', qrUrl: 'https://itax/qr' });
    expect(await svc.afterCommit(result, input()).etims).toEqual({ success: true, controlNumber: 'CN-7', qrUrl: 'https://itax/qr' });
    etims.submitSale.mockRejectedValue(new Error('KRA down'));
    expect(await svc.afterCommit(result, input()).etims).toBeNull();
  });

  it('nothing it does can throw or reject, however each part fails', async () => {
    const { svc, tx, audit, ledger, etims, events } = setup();
    audit.createEntry.mockRejectedValue(new Error('audit down'));
    ledger.autoPost.mockRejectedValue(new Error('ledger down'));
    etims.submitSale.mockRejectedValue(new Error('KRA down'));
    events.emitSaleCreated.mockImplementation(() => { throw new Error('socket down'); });
    const result = await svc.createInTx(tx, input());
    expect(() => svc.afterCommit(result, input())).not.toThrow();
    await flush();
    await flush();
  });
});

describe('DirectSaleService.receiptFor', () => {
  const sale = (o: Record<string, any> = {}) => ({
    id: 'sale-9', businessId: 'biz-1', receiptNumber: 'NRB01-2026-0000009', customerName: null, buyerKraPin: 'A012345678Z', subtotalCents: 100, vatCents: 16, totalCents: 116, status: 'PAID',
    items: [{ name: 'Super (Pump 1)', quantity: 10, unitPriceCents: 1000, totalCents: 10000, id: 'x', saleId: 'sale-9' }],
    payments: [{ method: 'CASH', amountCents: 116, id: 'p', offlineId: 'o' }],
    customer: null,
    ...o,
  });
  const make = (found: any, submit: jest.Mock) => {
    const prisma: any = { sale: { findFirst: jest.fn().mockResolvedValue(found) } };
    const svc = new DirectSaleService(prisma, {} as any, { submitSale: submit } as any, {} as any, {} as any);
    return { svc, prisma };
  };

  it('gives the invoice lines and payments a receipt needs, and KRA\'s answer', async () => {
    const submit = jest.fn().mockResolvedValue({ success: true, controlNumber: 'CN-1', qrUrl: 'https://itax/qr' });
    const { svc, prisma } = make(sale(), submit);
    const r: any = await svc.receiptFor('sale-9', 'biz-1');
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sale-9', businessId: 'biz-1' } }));
    expect(r.etims).toEqual({ success: true, controlNumber: 'CN-1', qrUrl: 'https://itax/qr' });
    expect(r.invoice.items).toEqual([{ name: 'Super (Pump 1)', quantity: 10, unitPriceCents: 1000, totalCents: 10000 }]);
    expect(r.invoice.payments).toEqual([{ method: 'CASH', amountCents: 116 }]);
    expect(r.invoice.buyerKraPin).toBe('A012345678Z');
  });

  it('the customer\'s own PIN and name win, as on the original receipt', async () => {
    const { svc } = make(sale({ customer: { name: 'Acme', kraPin: 'P051234567Z' } }), jest.fn().mockResolvedValue({ success: true }));
    const r: any = await svc.receiptFor('sale-9', 'biz-1');
    expect(r.invoice.buyerKraPin).toBe('P051234567Z');
    expect(r.invoice.customerName).toBe('Acme');
    expect(r.invoice.customer).toBeUndefined();
  });

  it('still returns the receipt when KRA cannot be reached', async () => {
    const { svc } = make(sale(), jest.fn().mockRejectedValue(new Error('KRA down')));
    const r: any = await svc.receiptFor('sale-9', 'biz-1');
    expect(r.etims).toBeNull();
    expect(r.invoice.id).toBe('sale-9');
  });

  it('another business\'s sale is not found', async () => {
    const { svc } = make(null, jest.fn());
    await expect(svc.receiptFor('sale-x', 'biz-1')).rejects.toThrow(/not found/i);
  });
});
