import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';

const APPROVAL = { reason: 'Regular patient, prescriber phoned it through', approvedById: 'u-mgr', approvedByName: 'Grace', patientName: 'Jane Doe', patientIdNumber: '123' };

const MORPHINE = { id: 'item-m', name: 'Morphine 10mg/ml', requiresPrescription: false, scheduleClass: 'II', unitLabel: 'ml' };
const AMOX = { id: 'item-a', name: 'Amoxicillin 500mg', requiresPrescription: true, scheduleClass: null, unitLabel: null };
const BREAD = { id: 'item-b', name: 'Bread', requiresPrescription: false, scheduleClass: null, unitLabel: null };

function build(catalogue = [MORPHINE, AMOX, BREAD]) {
  const proformaItems = (ids: string[]) => ids.map((id) => ({ itemId: id, name: catalogue.find((c) => c.id === id)?.name ?? 'x', quantity: 2, unitPriceCents: 1000, totalCents: 2000 }));
  const tx: any = {
    sale: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'sale-new', ...data })), update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'pro-1', totalCents: 2000, ...data })) },
    item: { findUnique: jest.fn().mockResolvedValue(null) },
    store: { update: jest.fn().mockResolvedValue({ receiptSequence: 5 }) },
    rxSafetyOverride: { create: jest.fn().mockResolvedValue({}) },
    controlledSubstanceLog: { create: jest.fn().mockResolvedValue({}) },
    user: { findFirst: jest.fn().mockResolvedValue({ name: 'Peter' }) },
  };
  const prisma: any = {
    sale: { findFirst: jest.fn() },
    item: { findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.id ? catalogue.filter((c) => where.id.in.includes(c.id)) : catalogue.filter((c) => (where.OR ?? []).some((o: any) => o.name.equals.toLowerCase() === c.name.toLowerCase())))) },
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'store-1', businessId: 'biz-1', storeCode: 'NRB01', receiptSequence: 4 }), update: jest.fn().mockResolvedValue({ storeCode: 'NRB01', receiptSequence: 5 }) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };
  const audit = { createEntry: jest.fn().mockResolvedValue(undefined) };
  const svc: any = new (SalesService as any)();
  Object.assign(svc, { prisma, audit });
  const withNames = (names: string[]) => prisma.sale.findFirst.mockResolvedValue({ id: 'pro-1', businessId: 'biz-1', storeId: 'store-1', status: 'PROFORMA', type: 'PROFORMA', customerId: null, subtotalCents: 2000, vatCents: 0, totCents: 0, totalCents: 2000, serviceChargeCents: 0, discountCents: 0, items: names.map((n) => ({ itemId: null, name: n, quantity: 1, unitPriceCents: 1000, totalCents: 1000 })) });
  const withItems = (ids: string[]) => prisma.sale.findFirst.mockResolvedValue({ id: 'pro-1', businessId: 'biz-1', storeId: 'store-1', status: 'PROFORMA', type: 'PROFORMA', customerId: null, subtotalCents: 2000, vatCents: 0, totCents: 0, totalCents: 2000, serviceChargeCents: 0, discountCents: 0, items: proformaItems(ids) });
  return { svc, tx, prisma, audit, withItems, withNames };
}
const pay = [{ method: 'CASH', amountCents: 2000 }];

describe('converting a quotation that holds restricted medicines', () => {
  it('is refused without approval, before a receipt number is taken or anything is written', async () => {
    const { svc, prisma, tx, withItems } = build();
    withItems(['item-a', 'item-b']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay })).rejects.toMatchObject({ response: { code: 'RESTRICTED_SALE' } });
    expect(prisma.store.update).not.toHaveBeenCalled();
    expect(tx.sale.create).not.toHaveBeenCalled();
  });

  it('goes ahead with a manager\'s approval, and the approval is on record', async () => {
    const { svc, tx, withItems } = build();
    withItems(['item-a']);
    await svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay, restrictedOverride: APPROVAL });
    expect(tx.rxSafetyOverride.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'RESTRICTED_SALE', saleId: 'sale-new', approvedByName: 'Grace', detail: expect.stringContaining('Amoxicillin') }) });
    expect(tx.controlledSubstanceLog.create).not.toHaveBeenCalled();
  });

  it('puts a controlled drug on the register against the person it went to, and needs that person named', async () => {
    const { svc, tx, withItems } = build();
    withItems(['item-m']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay, restrictedOverride: { ...APPROVAL, patientName: '' } })).rejects.toThrow(/who it is being sold to/);
    await svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay, restrictedOverride: APPROVAL });
    expect(tx.controlledSubstanceLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemName: 'Morphine 10mg/ml', scheduleClass: 'II', quantityDispensed: 2, unit: 'ml', patientName: 'Jane Doe', dispensedBy: 'Peter' }) });
  });

  it('a quotation of ordinary goods converts as before, with no approval and nothing on the register', async () => {
    const { svc, tx, withItems } = build();
    withItems(['item-b']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay })).resolves.toBeDefined();
    expect(tx.rxSafetyOverride.create).not.toHaveBeenCalled();
  });

  it('a reason that is too short is refused', async () => {
    const { svc, withItems } = build();
    withItems(['item-a']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay, restrictedOverride: { ...APPROVAL, reason: 'ok' } })).rejects.toThrow(BadRequestException);
  });

  it('the older conversion route is guarded the same way', async () => {
    const { svc, tx, withItems, prisma } = build();
    withItems(['item-a']);
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1', businessId: 'biz-1', storeCode: 'NRB01', receiptSequence: 4, business: {} });
    await expect(svc.convertProformaToSale('pro-1', { businessId: 'biz-1', storeId: 'store-1', cashierId: 'u-1', payments: pay })).rejects.toMatchObject({ response: { code: 'RESTRICTED_SALE' } });
    expect(tx.sale.update).not.toHaveBeenCalled();
    await svc.convertProformaToSale('pro-1', { businessId: 'biz-1', storeId: 'store-1', cashierId: 'u-1', payments: pay, restrictedOverride: APPROVAL });
    expect(tx.rxSafetyOverride.create).toHaveBeenCalled();
  });
});

describe('older quotation lines that kept only a name', () => {
  it('are matched to the catalogue by name, so a prescription-only medicine cannot slip through', async () => {
    const { svc, tx, withNames } = build();
    withNames(['amoxicillin 500MG']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay })).rejects.toMatchObject({ response: { code: 'RESTRICTED_SALE' } });
    expect(tx.sale.create).not.toHaveBeenCalled();
    await svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay, restrictedOverride: APPROVAL });
    expect(tx.rxSafetyOverride.create).toHaveBeenCalled();
  });

  it('a name that matches nothing, or an ordinary item, converts as before', async () => {
    const { svc, withNames } = build();
    withNames(['Delivery fee', 'Bread']);
    await expect(svc.convertProformaToSaleV2('pro-1', { cashierId: 'u-1', payments: pay })).resolves.toBeDefined();
  });
});

describe('createProforma keeps the catalogue item on each line', () => {
  it('stores itemId for this business\'s items only, so the stock moves and the rule applies on conversion', async () => {
    const svc: any = new (SalesService as any)();
    const prisma: any = { item: { findMany: jest.fn().mockResolvedValue([{ id: 'item-a' }]) }, sale: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data })) }, business: { findUnique: jest.fn() } };
    Object.assign(svc, { prisma });
    await svc.createProforma({ businessId: 'biz-1', customerName: 'X', items: [{ itemId: 'item-a', name: 'Amoxicillin', quantity: 1, unitPriceCents: 100 }, { itemId: 'other-biz', name: 'Foreign', quantity: 1, unitPriceCents: 100 }, { name: 'Free text', quantity: 1, unitPriceCents: 100 }] });
    const lines = prisma.sale.create.mock.calls[0][0].data.items.create;
    expect(lines.map((l: any) => l.itemId)).toEqual(['item-a', undefined, undefined]);
    expect(prisma.item.findMany).toHaveBeenCalledWith({ where: { businessId: 'biz-1', id: { in: ['item-a', 'other-biz'] } }, select: { id: true } });
  });
});
