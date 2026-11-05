import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrescriptionsService, normalizeDrugName } from './prescriptions.service';

const PHARMACIST = { id: 'u-cash', name: 'Peter Otieno', role: 'CASHIER' };
const MANAGER = { id: 'u-mgr', name: 'Grace Wanjiku', role: 'MANAGER' };

function makeRx(o: Record<string, any> = {}) {
  return {
    id: 'rx-1', businessId: 'biz-1', storeId: 'store-1', prescriptionNumber: 'RX-AAAAA-20261105-0001',
    patientName: 'Jane Doe', patientIdNumber: '12345678', doctorName: 'Dr X', doctorLicense: 'KMPDC-1',
    items: JSON.stringify([{ itemId: 'item-1', name: 'Amoxicillin 500mg', qty: 21 }]),
    status: 'PENDING', refillsAllowed: 0, refillsUsed: 0, nextFillDate: null, notes: null, ...o,
  };
}
function makeItem(o: Record<string, any> = {}) {
  return { id: 'item-1', businessId: 'biz-1', name: 'Amoxicillin 500mg', trackStock: true, trackBatches: false, negativeStockPolicy: null, scheduleClass: null, unitLabel: 'caps', weightUnit: null, ...o };
}

function setup() {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    prescription: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn(), findMany: jest.fn() },
    item: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(makeItem()) },
    business: { findUnique: jest.fn().mockResolvedValue({ negativePolicyDefault: 'WARN' }) },
    inventoryMovement: { create: jest.fn(), aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 100 } }) },
    batch: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn(), findFirst: jest.fn() },
    controlledSubstanceLog: { create: jest.fn(), findMany: jest.fn() },
    drugInteraction: { findMany: jest.fn().mockResolvedValue([]) },
    drugCatalogue: { findMany: jest.fn().mockResolvedValue([]) },
    insuranceProvider: { findFirst: jest.fn().mockResolvedValue({ id: 'ins-1' }) },
    prescriptionFill: { create: jest.fn().mockResolvedValue({}) },
    insuranceClaim: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'claim-1', ...data })) },
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  p.prescription.create.mockImplementation(async ({ data }: any) => ({ id: 'rx', ...data }));
  p.prescription.findFirst.mockResolvedValue(makeRx());
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(false),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => {
      const total = input.lines.reduce((sum: number, l: any) => sum + l.totalCents, 0);
      return { sale: { id: 'sale-1', receiptNumber: 'NRB-2026-0000009', totalCents: total, vatCents: 0, totCents: 0, status: 'PAID' }, isCredit: false, payments: input.payments };
    }),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CU9' }) }),
  };
  return { prisma: p, directSales, svc: new PrescriptionsService(p, directSales) };
}

const NEW_RX = { businessId: 'biz-1', storeId: 'store-1', patientName: 'Jane', doctorName: 'Dr X', items: [{ name: 'Amoxicillin', qty: 21 }] };
const clash = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('prescription numbering', () => {
  it('puts the business in the number so two pharmacies never share RX-<date>-0001', async () => {
    const a = setup(); const b = setup();
    a.prisma.prescription.findFirst.mockResolvedValue(null);
    b.prisma.prescription.findFirst.mockResolvedValue(null);
    const x: any = await a.svc.create({ ...NEW_RX, businessId: 'biz-aaa' });
    const y: any = await b.svc.create({ ...NEW_RX, businessId: 'biz-bbb' });
    expect(x.prescriptionNumber).toMatch(/^RX-[0-9A-F]{5}-\d{8}-0001$/);
    expect(y.prescriptionNumber).toMatch(/^RX-[0-9A-F]{5}-\d{8}-0001$/);
    expect(x.prescriptionNumber).not.toBe(y.prescriptionNumber);
  });

  it('continues from the highest number issued today, not from a count', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockImplementation(async ({ where }: any) => ({ prescriptionNumber: `${where.prescriptionNumber.startsWith}0007` }));
    const rx: any = await svc.create(NEW_RX);
    expect(rx.prescriptionNumber.endsWith('-0008')).toBe(true);
    expect(prisma.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { prescriptionNumber: 'desc' } }));
  });

  it('retries on a unique-number collision instead of failing', async () => {
    const { svc, prisma } = setup();
    let n = 0;
    prisma.prescription.findFirst.mockImplementation(async ({ where }: any) => (n === 0 ? null : { prescriptionNumber: `${where.prescriptionNumber.startsWith}000${n}` }));
    prisma.prescription.create
      .mockImplementationOnce(async () => { n = 1; throw clash(); })
      .mockImplementationOnce(async () => { n = 2; throw clash(); })
      .mockImplementation(async ({ data }: any) => ({ id: 'rx', ...data }));
    const rx: any = await svc.create(NEW_RX);
    expect(rx.prescriptionNumber.endsWith('-0003')).toBe(true);
    expect(prisma.prescription.create).toHaveBeenCalledTimes(3);
  });

  it('gives up with the real error after too many collisions, and never swallows other errors', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(null);
    prisma.prescription.create.mockRejectedValue(clash());
    await expect(svc.create(NEW_RX)).rejects.toMatchObject({ code: 'P2002' });
    expect(prisma.prescription.create).toHaveBeenCalledTimes(10);
    const other = setup();
    other.prisma.prescription.findFirst.mockResolvedValue(null);
    other.prisma.prescription.create.mockRejectedValue(new Error('connection lost'));
    await expect(other.svc.create(NEW_RX)).rejects.toThrow('connection lost');
    expect(other.prisma.prescription.create).toHaveBeenCalledTimes(1);
  });
});

describe('PrescriptionsService.create validation', () => {
  it('needs at least one medicine, each with a positive quantity', async () => {
    const { svc } = setup();
    await expect(svc.create({ ...NEW_RX, items: [] })).rejects.toThrow(/at least one medicine/);
    for (const qty of [0, -3, NaN, 'lots', 20000, 1.2345]) {
      await expect(svc.create({ ...NEW_RX, items: [{ name: 'X', qty: qty as any }] })).rejects.toThrow(BadRequestException);
    }
    await expect(svc.create({ ...NEW_RX, items: [{ name: '', qty: 1 }] })).rejects.toThrow(BadRequestException);
  });

  it('refuses an item from another business, a foreign store and silly refill counts', async () => {
    const { svc, prisma } = setup();
    prisma.item.count.mockResolvedValue(0);
    await expect(svc.create({ ...NEW_RX, items: [{ itemId: 'theirs', name: 'X', qty: 1 }] })).rejects.toThrow(/not in this business/);
    prisma.item.count.mockResolvedValue(1);
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(svc.create(NEW_RX)).rejects.toThrow(/Store not found/);
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    for (const refillsAllowed of [-1, 13, 1.5]) {
      await expect(svc.create({ ...NEW_RX, refillsAllowed })).rejects.toThrow(BadRequestException);
    }
  });
});

describe('PrescriptionsService.dispense', () => {
  it('claims the prescription conditionally and records who dispensed it, from the login', async () => {
    const { svc, prisma } = setup();
    await svc.dispense('rx-1', 'biz-1', PHARMACIST);
    const call = prisma.prescription.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'rx-1', businessId: 'biz-1', status: 'PENDING', refillsUsed: 0 });
    expect(call.data.dispensedBy).toBe('Peter Otieno');
    expect(call.data.status).toBe('DISPENSED');
    expect(call.data.refillsUsed).toEqual({ increment: 1 });
    expect(call.data.nextFillDate).toBeInstanceOf(Date);
  });

  it('takes the stock in the same transaction', async () => {
    const { svc, prisma } = setup();
    await svc.dispense('rx-1', 'biz-1', PHARMACIST);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: 'item-1', quantity: -21, type: 'SALE', source: 'Prescription RX-AAAAA-20261105-0001' }),
    });
  });

  it('refuses a second dispense, a cancelled prescription and a referred one', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(makeRx({ status: 'DISPENSED', refillsUsed: 1 }));
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/already been dispensed/);
    for (const status of ['CANCELLED', 'REFERRED_EXTERNAL']) {
      prisma.prescription.findFirst.mockResolvedValue(makeRx({ status }));
      await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/cannot be dispensed/);
    }
    expect(prisma.prescription.updateMany).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('a lost race (two pharmacists, or a double click) takes no stock', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/just dispensed by someone else/);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.controlledSubstanceLog.create).not.toHaveBeenCalled();
  });

  it('treats another business\'s prescription as missing', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(null);
    await expect(svc.dispense('rx-1', 'biz-2', PHARMACIST)).rejects.toThrow(NotFoundException);
  });

  it('refuses when the item\'s policy is BLOCK and stock is short, taking nothing', async () => {
    const { svc, prisma } = setup();
    prisma.item.findFirst.mockResolvedValue(makeItem({ negativeStockPolicy: 'BLOCK' }));
    prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/Insufficient stock for Amoxicillin/);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('follows the business default when the item has no policy of its own', async () => {
    const { svc, prisma } = setup();
    prisma.business.findUnique.mockResolvedValue({ negativePolicyDefault: 'BLOCK' });
    prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 0 } });
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/Insufficient stock/);
  });

  it('a stock error fails the dispense instead of being swallowed', async () => {
    const { svc, prisma } = setup();
    prisma.item.findFirst.mockResolvedValue(makeItem({ trackBatches: true }));
    prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
    const expired = { id: 'b1', itemId: 'item-1', storeId: 'store-1', status: 'ACTIVE', quantityRemaining: 5, expiryDate: new Date(Date.now() - 86400000) };
    prisma.batch.findMany.mockResolvedValue([expired]);
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/only expired stock is left/);
  });

  it('writes a controlled drug onto the register, naming who dispensed it', async () => {
    const { svc, prisma } = setup();
    prisma.item.findFirst.mockResolvedValue(makeItem({ name: 'Morphine 10mg', scheduleClass: 'II', unitLabel: 'tabs' }));
    await svc.dispense('rx-1', 'biz-1', PHARMACIST);
    expect(prisma.controlledSubstanceLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz-1', prescriptionId: 'rx-1', itemName: 'Morphine 10mg', scheduleClass: 'II', quantityDispensed: 21, unit: 'tabs',
        patientName: 'Jane Doe', patientIdNumber: '12345678', prescriberName: 'Dr X', dispensedBy: 'Peter Otieno',
      }),
    });
  });

  it('leaves over-the-counter and unclassified drugs off the register', async () => {
    const { svc, prisma } = setup();
    for (const scheduleClass of [null, 'OTC', '']) {
      prisma.item.findFirst.mockResolvedValue(makeItem({ scheduleClass }));
      await svc.dispense('rx-1', 'biz-1', PHARMACIST);
    }
    expect(prisma.controlledSubstanceLog.create).not.toHaveBeenCalled();
  });
});

describe('PrescriptionsService.refill', () => {
  const dispensed = (o: Record<string, any> = {}) => makeRx({ status: 'DISPENSED', refillsAllowed: 2, refillsUsed: 1, nextFillDate: new Date(Date.now() - 86400000), ...o });

  it('a prescription with 2 refills allows exactly 3 fills in all', async () => {
    const { svc, prisma } = setup();
    for (const used of [1, 2]) {
      prisma.prescription.findFirst.mockResolvedValue(dispensed({ refillsUsed: used }));
      await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).resolves.toBeTruthy();
    }
    prisma.prescription.findFirst.mockResolvedValue(dispensed({ refillsUsed: 3 }));
    await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/No refills remaining/);
  });

  it('a prescription with no refills allowed cannot be refilled after its one fill', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(dispensed({ refillsAllowed: 0, refillsUsed: 1 }));
    await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/No refills remaining/);
  });

  it('cannot refill what was never dispensed, cancelled or referred', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(makeRx({ status: 'PENDING' }));
    await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/Dispense the prescription before/);
    for (const status of ['CANCELLED', 'REFERRED_EXTERNAL']) {
      prisma.prescription.findFirst.mockResolvedValue(dispensed({ status }));
      await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/cannot be refilled/);
    }
  });

  it('is not allowed early for counter staff, but a manager can', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(dispensed({ nextFillDate: new Date(Date.now() + 10 * 86400000) }));
    await expect(svc.refill('rx-1', 'biz-1', PHARMACIST)).rejects.toThrow(/Not due until/);
    await expect(svc.refill('rx-1', 'biz-1', MANAGER)).resolves.toBeTruthy();
  });

  it('writes the refill to the register for a controlled drug, marked as a refill', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(dispensed());
    prisma.item.findFirst.mockResolvedValue(makeItem({ scheduleClass: 'IV' }));
    await svc.refill('rx-1', 'biz-1', PHARMACIST);
    expect(prisma.controlledSubstanceLog.create.mock.calls[0][0].data.notes).toMatch(/refill 1/);
  });
});

describe('PrescriptionsService.cancel and the refill queue', () => {
  it('cancels a waiting prescription and one dispensed (stopping its refills), keeping the reason', async () => {
    const { svc, prisma } = setup();
    for (const status of ['PENDING', 'DISPENSED']) {
      prisma.prescription.findFirst.mockResolvedValue(makeRx({ status, notes: 'allergic to penicillin' }));
      await svc.cancel('rx-1', 'biz-1', 'doctor changed it');
    }
    expect(prisma.prescription.updateMany.mock.calls[0][0].data.notes).toBe('allergic to penicillin | Cancelled: doctor changed it');
  });

  it('will not cancel one that is already cancelled or referred, or on a lost race', async () => {
    const { svc, prisma } = setup();
    prisma.prescription.findFirst.mockResolvedValue(makeRx({ status: 'CANCELLED' }));
    await expect(svc.cancel('rx-1', 'biz-1')).rejects.toThrow(/cannot be cancelled/);
    prisma.prescription.findFirst.mockResolvedValue(makeRx());
    prisma.prescription.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.cancel('rx-1', 'biz-1')).rejects.toThrow(/just changed/);
  });

  it('queues dispensed prescriptions that are due and have a fill left', async () => {
    const { svc, prisma } = setup();
    const past = new Date(Date.now() - 86400000);
    const future = new Date(Date.now() + 86400000);
    prisma.prescription.findMany.mockResolvedValue([
      makeRx({ id: 'due', status: 'DISPENSED', refillsAllowed: 1, refillsUsed: 1, nextFillDate: past }),
      makeRx({ id: 'not-due', status: 'DISPENSED', refillsAllowed: 1, refillsUsed: 1, nextFillDate: future }),
      makeRx({ id: 'used-up', status: 'DISPENSED', refillsAllowed: 1, refillsUsed: 2, nextFillDate: past }),
      makeRx({ id: 'no-refills', status: 'DISPENSED', refillsAllowed: 0, refillsUsed: 1, nextFillDate: past }),
    ]);
    expect((await svc.getRefillQueue('biz-1')).map((r: any) => r.id)).toEqual(['due']);
  });
});

describe('interaction matching', () => {
  it('reads a drug name the way a pharmacist does', () => {
    expect(normalizeDrugName('Warfarin 5mg tablets')).toBe('warfarin');
    expect(normalizeDrugName('ASPIRIN 300 MG')).toBe('aspirin');
    expect(normalizeDrugName('Amoxicillin (Amoxil) 500mg caps')).toBe('amoxicillin');
    expect(normalizeDrugName('Paracetamol 120mg/5ml syrup')).toBe('paracetamol');
  });

  const IX = { id: 'ix-1', drug1Name: 'Warfarin', drug2Name: 'Aspirin', severity: 'HIGH', description: 'bleeding' };

  it('matches names carrying strengths and pack words, in either order', async () => {
    const { svc, prisma } = setup();
    prisma.drugInteraction.findMany.mockResolvedValue([IX]);
    expect(await svc.checkInteractions('biz-1', ['Warfarin 5mg tablets', 'Aspirin 300mg'])).toHaveLength(1);
    expect(await svc.checkInteractions('biz-1', ['aspirin', 'WARFARIN'])).toHaveLength(1);
  });

  it('matches a brand through the drug catalogue', async () => {
    const { svc, prisma } = setup();
    prisma.drugInteraction.findMany.mockResolvedValue([IX]);
    prisma.drugCatalogue.findMany.mockResolvedValue([{ genericName: 'Warfarin', brandName: 'Coumadin' }]);
    expect(await svc.checkInteractions('biz-1', ['Coumadin 5mg', 'Aspirin'])).toHaveLength(1);
  });

  it('does not invent interactions, and reports one entry once', async () => {
    const { svc, prisma } = setup();
    prisma.drugInteraction.findMany.mockResolvedValue([IX, { ...IX, id: 'ix-2', drug1Name: 'Aspirin', drug2Name: 'Warfarin' }]);
    expect(await svc.checkInteractions('biz-1', ['Warfarin', 'Paracetamol'])).toHaveLength(0);
    expect(await svc.checkInteractions('biz-1', ['Warfarin', 'Aspirin', 'Paracetamol'])).toHaveLength(2);
    expect(await svc.checkInteractions('biz-1', ['Warfarin'])).toEqual([]);
  });
});

describe('controlled-substance register', () => {
  it('a one-day filter covers the whole Nairobi day', async () => {
    const { svc, prisma } = setup();
    prisma.controlledSubstanceLog.findMany.mockResolvedValue([]);
    await svc.getControlledLog('biz-1', '2026-11-05', '2026-11-05');
    const range = prisma.controlledSubstanceLog.findMany.mock.calls[0][0].where.dispensedAt;
    expect(range.gte.toISOString()).toBe('2026-11-04T21:00:00.000Z');
    expect(range.lte.toISOString()).toBe('2026-11-05T20:59:59.999Z');
    await expect(svc.getControlledLog('biz-1', 'garbage')).rejects.toThrow(BadRequestException);
  });

  it('a manual entry is attributed to the signed-in user whatever the request says', async () => {
    const { svc, prisma } = setup();
    prisma.controlledSubstanceLog.create.mockImplementation(async ({ data }: any) => data);
    const entry: any = await svc.addControlledLog(
      { businessId: 'biz-1', itemName: 'Morphine', scheduleClass: 'II', quantityDispensed: 10, unit: 'tabs', patientName: 'P', prescriberName: 'Dr', dispensedBy: 'someone else' } as any,
      PHARMACIST,
    );
    expect(entry.dispensedBy).toBe('Peter Otieno');
  });

  it('rejects a bad schedule, a zero quantity and a prescription from another business', async () => {
    const { svc, prisma } = setup();
    const base = { businessId: 'biz-1', itemName: 'M', scheduleClass: 'II', quantityDispensed: 1, unit: 'u', patientName: 'P', prescriberName: 'Dr' };
    await expect(svc.addControlledLog({ ...base, scheduleClass: 'OTC' }, PHARMACIST)).rejects.toThrow(/Schedule/);
    for (const quantityDispensed of [0, -1, NaN]) {
      await expect(svc.addControlledLog({ ...base, quantityDispensed }, PHARMACIST)).rejects.toThrow(BadRequestException);
    }
    prisma.prescription.findFirst.mockResolvedValue(null);
    await expect(svc.addControlledLog({ ...base, prescriptionId: 'theirs' }, PHARMACIST)).rejects.toThrow(NotFoundException);
    expect(prisma.controlledSubstanceLog.create).not.toHaveBeenCalled();
  });
});


describe('dispensing on the sales pipeline', () => {
  // 21 capsules at KES 20.00 = KES 420.00
  const priced = (o: Record<string, any> = {}) => [{ id: 'item-1', businessId: 'biz-1', name: 'Amoxicillin 500mg', retailPriceCents: 2000, taxClass: 'A', ...o }];
  function ready(over: Record<string, any> = {}) {
    const ctx = setup();
    ctx.directSales.isEnabled.mockResolvedValue(true);
    ctx.prisma.item.findMany = jest.fn().mockResolvedValue(priced(over));
    return ctx;
  }
  const cash = (amountCents: number) => ({ payments: [{ method: 'cash', amountCents }] });

  it('is unchanged for a business that has not switched over: no sale, no payment asked for', async () => {
    const { svc, directSales, prisma } = setup();
    const r: any = await svc.dispense('rx-1', 'biz-1', PHARMACIST);
    expect(directSales.createInTx).not.toHaveBeenCalled();
    expect(r.saleId).toBeUndefined();
    expect(prisma.insuranceClaim.create).not.toHaveBeenCalled();
  });

  it('quotes the fill from catalogue prices, and says nothing to collect off the pipeline', async () => {
    const on = ready();
    expect(await on.svc.quote('rx-1', 'biz-1')).toEqual({
      invoice: true, totalCents: 42000, unpriced: [],
      lines: [expect.objectContaining({ itemId: 'item-1', quantity: 21, unitPriceCents: 2000, totalCents: 42000, taxClass: 'A' })],
    });
    expect(await setup().svc.quote('rx-1', 'biz-1')).toEqual({ invoice: false, lines: [], totalCents: 0, unpriced: [] });
  });

  it('makes one sale for the fill, tied to the stock leaving, and returns the receipt', async () => {
    const { svc, directSales, prisma } = ready();
    const r: any = await svc.dispense('rx-1', 'biz-1', PHARMACIST, { ...cash(50000), buyerKraPin: 'p051234567z' });
    expect(directSales.createInTx).toHaveBeenCalledTimes(1);
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input).toEqual(expect.objectContaining({ source: 'PHARMACY', cashierId: 'u-cash', customerName: 'Jane Doe', buyerKraPin: 'P051234567Z', storeId: 'store-1' }));
    expect(input.lines).toEqual([expect.objectContaining({ itemId: 'item-1', quantity: 21, totalCents: 42000, taxClass: 'A' })]);
    expect(input.payments).toEqual([{ method: 'CASH', amountCents: 50000 }]);
    expect(input.notes).toBe('Prescription RX-AAAAA-20261105-0001, first fill');
    expect(prisma.prescriptionFill.create).toHaveBeenCalledWith({ data: expect.objectContaining({ prescriptionId: 'rx-1', saleId: 'sale-1', kind: 'FIRST' }) });
    expect(r).toEqual(expect.objectContaining({ saleId: 'sale-1', receiptNumber: 'NRB-2026-0000009', insurerShareCents: 0, patientShareCents: 42000, etims: expect.objectContaining({ controlNumber: 'CU9' }) }));
  });

  it('stock leaves under the sale, and the controlled-drug register records the receipt', async () => {
    const { svc, prisma } = ready();
    prisma.item.findFirst.mockResolvedValue(makeItem({ scheduleClass: 'II' }));
    await svc.dispense('rx-1', 'biz-1', PHARMACIST, cash(42000));
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ saleId: 'sale-1', itemId: 'item-1' }) });
    expect(prisma.controlledSubstanceLog.create.mock.calls[0][0].data.notes).toContain('receipt NRB-2026-0000009');
  });

  it('splits with an insurer: the patient pays their share, the rest is a claim on the sale', async () => {
    const { svc, directSales, prisma } = ready();
    const r: any = await svc.dispense('rx-1', 'biz-1', PHARMACIST, { ...cash(10000), insurance: { providerId: 'ins-1', memberNumber: 'M-77', patientPct: 20 } });
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input.payments).toEqual([{ method: 'CASH', amountCents: 10000 }, { method: 'INSURANCE', amountCents: 33600 }]);
    expect(prisma.insuranceClaim.create).toHaveBeenCalledWith({
      data: { businessId: 'biz-1', prescriptionId: 'rx-1', providerId: 'ins-1', patientInsuranceId: 'M-77', billedCents: 33600, copayPct: 20, status: 'SUBMITTED', saleId: 'sale-1' },
    });
    expect(r).toEqual(expect.objectContaining({ patientShareCents: 8400, insurerShareCents: 33600, claimId: 'claim-1', patientPaidCents: 10000 }));
  });

  it('a full-cover insurer needs no payment from the patient', async () => {
    const { svc, directSales } = ready();
    await svc.dispense('rx-1', 'biz-1', PHARMACIST, { insurance: { providerId: 'ins-1', patientPct: 0 } });
    expect(directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'INSURANCE', amountCents: 42000 }]);
  });

  it('refuses a short payment, and rolls the whole fill back', async () => {
    const { svc, directSales, prisma } = ready();
    directSales.createInTx.mockRejectedValue(new BadRequestException('Payments (100) do not cover the total (42000)'));
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST, cash(100))).rejects.toThrow(/do not cover/);
    expect(directSales.afterCommit).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.insuranceClaim.create).not.toHaveBeenCalled();
  });

  it('will not dispense a line that has no catalogue item or price: it cannot be invoiced', async () => {
    const noItem = ready();
    noItem.prisma.prescription.findFirst.mockResolvedValue(makeRx({ items: JSON.stringify([{ name: 'Mystery syrup', qty: 1 }]) }));
    await expect(noItem.svc.dispense('rx-1', 'biz-1', PHARMACIST, cash(1000))).rejects.toThrow(/Mystery syrup/);
    const noPrice = ready({ retailPriceCents: 0 });
    await expect(noPrice.svc.dispense('rx-1', 'biz-1', PHARMACIST, cash(1000))).rejects.toThrow(/Amoxicillin 500mg/);
    expect(noPrice.directSales.createInTx).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown payment method', { payments: [{ method: 'barter', amountCents: 1000 }] }, /Payment method/],
    ['a client-sent insurer payment', { payments: [{ method: 'INSURANCE', amountCents: 1000 }] }, /Payment method/],
    ['a non-positive amount', { payments: [{ method: 'CASH', amountCents: 0 }] }, /Payment amount/],
    ['a patient share of 100 percent', { insurance: { providerId: 'ins-1', patientPct: 100 } }, /Patient share/],
    ['a bad KRA PIN', { payments: [{ method: 'CASH', amountCents: 42000 }], buyerKraPin: 'nope' }, /KRA PIN/],
  ])('rejects %s before claiming anything', async (_label, opts, expected) => {
    const { svc, prisma, directSales } = ready();
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST, opts as any)).rejects.toThrow(expected as any);
    expect(prisma.prescription.updateMany).not.toHaveBeenCalled();
    expect(directSales.createInTx).not.toHaveBeenCalled();
  });

  it('refuses an insurer that is not this pharmacy\'s', async () => {
    const { svc, prisma } = ready();
    prisma.insuranceProvider.findFirst.mockResolvedValue(null);
    await expect(svc.dispense('rx-1', 'biz-1', PHARMACIST, { insurance: { providerId: 'ins-x', patientPct: 10 } })).rejects.toThrow(/not set up/);
  });

  it('a refill is its own sale', async () => {
    const { svc, directSales, prisma } = ready();
    prisma.prescription.findFirst.mockResolvedValue(makeRx({ status: 'DISPENSED', refillsAllowed: 2, refillsUsed: 1, nextFillDate: null }));
    await svc.refill('rx-1', 'biz-1', PHARMACIST, cash(42000));
    expect(directSales.createInTx.mock.calls[0][1].notes).toBe('Prescription RX-AAAAA-20261105-0001, refill 1');
  });
});
