import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabService } from './lab.service';
import { STARTER_TESTS } from './starter-tests';

const TECH = { id: 'u-tech', name: 'Lilian', role: 'LAB_TECH' };
const TECH2 = { id: 'u-tech2', name: 'Moses', role: 'LAB_TECH' };
const DOCTOR = { id: 'u-doc', name: 'Dr Doe', role: 'DOCTOR' };
const MANAGER = { id: 'u-mgr', name: 'Grace', role: 'MANAGER' };

const HB = JSON.stringify([{ name: 'Haemoglobin', kind: 'NUMERIC', unit: 'g/dL', low: 13, high: 17, lowF: 12, highF: 15, critLow: 7 }]);

function setup() {
  const p: any = {
    visit: { findFirst: jest.fn().mockResolvedValue({ id: 'v-1', storeId: 'store-1', patientId: 'pt-1', status: 'IN_CONSULTATION' }), findMany: jest.fn().mockResolvedValue([{ id: 'v-1', visitNumber: 'V-1' }]) },
    patient: { findFirst: jest.fn().mockResolvedValue({ name: 'Jane Doe', sex: 'F', dateOfBirth: null }), findMany: jest.fn().mockResolvedValue([{ id: 'pt-1', name: 'Jane Doe', patientNumber: 'PT-0001', sex: 'F', dateOfBirth: null, allergies: '[]', conditions: '[]' }]) },
    item: { findFirst: jest.fn().mockResolvedValue({ id: 'item-1', type: 'SERVICE', name: 'Lab fee' }), findMany: jest.fn().mockResolvedValue([{ id: 'item-1', retailPriceCents: 30000 }]) },
    labTest: {
      findMany: jest.fn().mockResolvedValue([{ id: 't-1', name: 'Haemoglobin', specimen: 'BLOOD', parameters: HB, itemId: 'item-1' }]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 't-new', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }), findFirst: jest.fn().mockResolvedValue({ id: 't-1', itemId: null, parameters: HB }), createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    labOrder: {
      findFirst: jest.fn().mockResolvedValue({ id: 'o-1', businessId: 'biz-1', patientId: 'pt-1', visitId: 'v-1', status: 'COLLECTED', orderNumber: 'L-1' }),
      findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'o-new', ...data })), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    labOrderItem: {
      findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    visitCharge: { create: jest.fn().mockResolvedValue({ id: 'ch-1' }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (fn: any) => fn(p));
  const notifications: any = { createNotification: jest.fn().mockResolvedValue({}) };
  return { prisma: p, notifications, svc: new LabService(p, notifications) };
}

const pendingItem = (o: Record<string, unknown> = {}) => ({ id: 'i-1', orderId: 'o-1', businessId: 'biz-1', testId: 't-1', testName: 'Haemoglobin', parameters: HB, status: 'PENDING', results: '[]', resultedById: null, resultedAt: null, ...o });

describe('LabService.createOrder', () => {
  it('orders the tests inside the open visit, and charges the priced ones in the same transaction', async () => {
    const { svc, prisma } = setup();
    prisma.labOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: 'o-new', patientId: 'pt-1', visitId: 'v-1', status: 'ORDERED' });
    await svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'], priority: 'urgent', clinicalNotes: ' fever ' }, DOCTOR);
    expect(prisma.labOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: 'biz-1', storeId: 'store-1', patientId: 'pt-1', visitId: 'v-1', priority: 'URGENT', clinicalNotes: 'fever', orderedBy: 'u-doc', orderedByName: 'Dr Doe', orderNumber: expect.stringMatching(/^L-\d{8}-001$/) }) });
    expect(prisma.visitCharge.create).toHaveBeenCalledWith({ data: { businessId: 'biz-1', visitId: 'v-1', itemId: 'item-1', name: 'Haemoglobin', quantity: 1, unitPriceCents: 30000, addedBy: 'Dr Doe' } });
    expect(prisma.labOrderItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: 'o-new', testId: 't-1', chargeId: 'ch-1', parameters: HB }) });
  });

  it('refuses a visit that is closed, unknown or has no tests chosen', async () => {
    const a = setup();
    a.prisma.visit.findFirst.mockResolvedValue({ id: 'v-1', storeId: 's', patientId: 'pt-1', status: 'COMPLETED' });
    await expect(a.svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'] }, DOCTOR)).rejects.toThrow(/open visit/);
    const b = setup();
    b.prisma.visit.findFirst.mockResolvedValue(null);
    await expect(b.svc.createOrder('biz-1', { visitId: 'nope', tests: ['t-1'] }, DOCTOR)).rejects.toThrow(NotFoundException);
    const c = setup();
    await expect(c.svc.createOrder('biz-1', { visitId: 'v-1', tests: [] }, DOCTOR)).rejects.toThrow(/at least one test/);
    expect(c.prisma.labOrder.create).not.toHaveBeenCalled();
  });

  it('refuses a test that is gone, and one linked to an item with no price', async () => {
    const a = setup();
    a.prisma.labTest.findMany.mockResolvedValue([]);
    await expect(a.svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'] }, DOCTOR)).rejects.toThrow(/not in the catalogue/);
    const b = setup();
    b.prisma.item.findMany.mockResolvedValue([{ id: 'item-1', retailPriceCents: 0 }]);
    await expect(b.svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'] }, DOCTOR)).rejects.toThrow(/no price/);
    expect(b.prisma.labOrder.create).not.toHaveBeenCalled();
  });

  it('does not order the same test twice while the first is unfinished (it would be charged twice)', async () => {
    const { svc, prisma } = setup();
    prisma.labOrder.findMany.mockResolvedValue([{ id: 'o-old' }]);
    prisma.labOrderItem.findFirst.mockResolvedValue({ testName: 'Haemoglobin' });
    await expect(svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'] }, DOCTOR)).rejects.toThrow(/already been ordered/);
    expect(prisma.visitCharge.create).not.toHaveBeenCalled();
  });

  it('a test with no price on the price list is ordered without a charge', async () => {
    const { svc, prisma } = setup();
    prisma.labTest.findMany.mockResolvedValue([{ id: 't-1', name: 'Haemoglobin', specimen: 'BLOOD', parameters: HB, itemId: null }]);
    prisma.labOrder.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: 'o-new', patientId: 'pt-1', visitId: 'v-1', status: 'ORDERED' });
    await svc.createOrder('biz-1', { visitId: 'v-1', tests: ['t-1'] }, DOCTOR);
    expect(prisma.visitCharge.create).not.toHaveBeenCalled();
    expect(prisma.labOrderItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ chargeId: null }) });
  });
});

describe('LabService.collect', () => {
  it('moves an ordered specimen to collected, once', async () => {
    const { svc, prisma } = setup();
    await svc.collect('biz-1', 'o-1', TECH);
    expect(prisma.labOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', businessId: 'biz-1', status: 'ORDERED' }, data: expect.objectContaining({ status: 'COLLECTED', collectedByName: 'Lilian' }) });
    prisma.labOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.collect('biz-1', 'o-1', TECH)).rejects.toThrow(/already collected/);
  });
});

describe('LabService.saveResults', () => {
  it('flags the value against the patient\'s own range and marks the test entered', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    prisma.labOrderItem.findMany.mockResolvedValue([{ status: 'RESULTED' }]);
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: '11.2' }, comment: 'hemolysed' }, TECH);
    const { data } = prisma.labOrderItem.updateMany.mock.calls[0][0];
    expect(JSON.parse(data.results)).toEqual([{ name: 'Haemoglobin', unit: 'g/dL', value: '11.2', low: 12, high: 15, flag: 'LOW' }]);
    expect(data).toMatchObject({ status: 'RESULTED', hasCritical: false, comment: 'hemolysed', resultedById: 'u-tech', resultedBy: 'Lilian' });
    expect(prisma.labOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', businessId: 'biz-1' }, data: { status: 'RESULTED' } });
  });

  it('records a critical value', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 5.5 } }, TECH);
    expect(prisma.labOrderItem.updateMany.mock.calls[0][0].data.hasCritical).toBe(true);
  });

  it('needs the specimen collected, an order that is not cancelled, and an unreleased test', async () => {
    const a = setup();
    a.prisma.labOrder.findFirst.mockResolvedValue({ id: 'o-1', patientId: 'pt-1', status: 'ORDERED' });
    await expect(a.svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 14 } }, TECH)).rejects.toThrow(/Collect the specimen/);
    const b = setup();
    b.prisma.labOrder.findFirst.mockResolvedValue({ id: 'o-1', patientId: 'pt-1', status: 'CANCELLED' });
    await expect(b.svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 14 } }, TECH)).rejects.toThrow(/cancelled/);
    const c = setup();
    c.prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem({ status: 'VERIFIED' }));
    await expect(c.svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 14 } }, TECH)).rejects.toThrow(/has been released/);
    expect(c.prisma.labOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a value the test does not measure or that is not a number', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await expect(svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Potassium: 4 } }, TECH)).rejects.toThrow(/not measured/);
    await expect(svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 'x' } }, TECH)).rejects.toThrow(BadRequestException);
    expect(prisma.labOrderItem.updateMany).not.toHaveBeenCalled();
  });

  it('loses cleanly to a release that happened a moment ago', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    prisma.labOrderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 14 } }, TECH)).rejects.toThrow(/just released/);
  });
});

describe('LabService.verify', () => {
  const entered = (o: Record<string, unknown> = {}) => pendingItem({ status: 'RESULTED', resultedById: 'u-tech', resultedAt: new Date('2026-11-12T10:00:00Z'), ...o });

  it('releases what someone else entered', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(entered());
    prisma.labOrderItem.findMany.mockResolvedValue([{ status: 'VERIFIED' }]);
    await svc.verify('biz-1', 'o-1', 'i-1', TECH2);
    expect(prisma.labOrderItem.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: 'RESULTED', resultedAt: new Date('2026-11-12T10:00:00Z') }), data: expect.objectContaining({ status: 'VERIFIED', verifiedById: 'u-tech2', verifiedBy: 'Moses' }) });
    expect(prisma.labOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', businessId: 'biz-1' }, data: { status: 'VERIFIED' } });
  });

  it('will not let people release their own entry, except a manager', async () => {
    const a = setup();
    a.prisma.labOrderItem.findFirst.mockResolvedValue(entered());
    await expect(a.svc.verify('biz-1', 'o-1', 'i-1', TECH)).rejects.toThrow(ForbiddenException);
    expect(a.prisma.labOrderItem.updateMany).not.toHaveBeenCalled();
    const b = setup();
    b.prisma.labOrderItem.findFirst.mockResolvedValue(entered({ resultedById: 'u-mgr' }));
    await expect(b.svc.verify('biz-1', 'o-1', 'i-1', MANAGER)).resolves.toBeDefined();
  });

  it('needs results to release, and is refused if they changed since they were looked at', async () => {
    const a = setup();
    a.prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await expect(a.svc.verify('biz-1', 'o-1', 'i-1', TECH2)).rejects.toThrow(/no results/);
    const b = setup();
    b.prisma.labOrderItem.findFirst.mockResolvedValue(entered({ status: 'VERIFIED' }));
    await expect(b.svc.verify('biz-1', 'o-1', 'i-1', TECH2)).rejects.toThrow(/already released/);
    const c = setup();
    c.prisma.labOrderItem.findFirst.mockResolvedValue(entered());
    c.prisma.labOrderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(c.svc.verify('biz-1', 'o-1', 'i-1', TECH2)).rejects.toThrow(/just changed/);
  });
});

describe('LabService.reopen and cancel', () => {
  it('only a manager sends a released result back, with a reason that is kept', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem({ status: 'VERIFIED' }));
    await expect(svc.reopen('biz-1', 'o-1', 'i-1', 'wrong sample', TECH)).rejects.toThrow(ForbiddenException);
    await expect(svc.reopen('biz-1', 'o-1', 'i-1', '', MANAGER)).rejects.toThrow(/Reason/);
    await svc.reopen('biz-1', 'o-1', 'i-1', 'wrong sample', MANAGER);
    expect(prisma.labOrderItem.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: 'VERIFIED' }), data: expect.objectContaining({ status: 'RESULTED', amendedNote: 'Grace: wrong sample', verifiedAt: null }) });
  });

  it('cancelling needs a reason, takes the charges off the visit, and only works before collection', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findMany.mockResolvedValue([{ chargeId: 'ch-1' }, { chargeId: null }]);
    await expect(svc.cancel('biz-1', 'o-1', '')).rejects.toThrow(/Reason/);
    await svc.cancel('biz-1', 'o-1', 'Ordered by mistake');
    expect(prisma.labOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'o-1', businessId: 'biz-1', status: 'ORDERED' }, data: { status: 'CANCELLED', cancelReason: 'Ordered by mistake' } });
    expect(prisma.visitCharge.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ch-1'] }, visitId: 'v-1', businessId: 'biz-1' } });
    prisma.labOrder.updateMany.mockResolvedValue({ count: 0 });
    prisma.visitCharge.deleteMany.mockClear();
    await expect(svc.cancel('biz-1', 'o-1', 'again')).rejects.toThrow(/specimen has not been taken/);
    expect(prisma.visitCharge.deleteMany).not.toHaveBeenCalled();
  });
});

describe('LabService catalogue', () => {
  it('adds only the starter tests that are missing', async () => {
    const { svc, prisma } = setup();
    prisma.labTest.findMany.mockResolvedValue([{ name: 'full blood count' }, { name: 'Haemoglobin' }]);
    const r = await svc.loadStarter('biz-1');
    expect(r.added).toBe(STARTER_TESTS.length - 2);
    const rows = prisma.labTest.createMany.mock.calls[0][0].data;
    expect(rows.map((x: any) => x.name)).not.toContain('Full blood count');
    expect(rows.every((x: any) => x.businessId === 'biz-1')).toBe(true);
  });

  it('a test is charged under a service, with valid parameters', async () => {
    const { svc, prisma } = setup();
    const params = [{ name: 'Result', kind: 'CHOICE', choices: ['Negative', 'Positive'], abnormal: ['Positive'] }];
    await svc.createTest('biz-1', { name: 'Malaria', category: 'parasitology', parameters: params, itemId: 'item-1' });
    expect(prisma.labTest.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: 'biz-1', name: 'Malaria', category: 'PARASITOLOGY', itemId: 'item-1', specimen: 'BLOOD' }) });
    prisma.item.findFirst.mockResolvedValue({ id: 'item-9', type: 'PRODUCT', name: 'Paracetamol' });
    await expect(svc.createTest('biz-1', { name: 'X', parameters: params, itemId: 'item-9' })).rejects.toThrow(/is a product/);
    await expect(svc.createTest('biz-1', { name: 'X', parameters: [] })).rejects.toThrow(/at least one/);
    await expect(svc.createTest('biz-1', { name: 'X', category: 'MAGIC', parameters: params })).rejects.toThrow(/Category/);
  });

  it('a duplicate name is said plainly', async () => {
    const { svc, prisma } = setup();
    prisma.labTest.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(svc.createTest('biz-1', { name: 'Malaria', parameters: [{ name: 'R', kind: 'TEXT' }] })).rejects.toThrow(/already a test called "Malaria"/);
  });
});

describe('LabService.board', () => {
  it('puts urgent orders first among the open ones and released ones apart', async () => {
    const { svc, prisma } = setup();
    prisma.labOrder.findMany.mockResolvedValue([
      { id: 'a', patientId: 'pt-1', visitId: 'v-1', status: 'COLLECTED', priority: 'NORMAL' },
      { id: 'b', patientId: 'pt-1', visitId: 'v-1', status: 'ORDERED', priority: 'URGENT' },
      { id: 'c', patientId: 'pt-1', visitId: 'v-1', status: 'VERIFIED', priority: 'NORMAL' },
    ]);
    const board = await svc.board('biz-1');
    expect(board.open.map((o: any) => o.id)).toEqual(['b', 'a']);
    expect(board.done.map((o: any) => o.id)).toEqual(['c']);
    expect(board.open[0].patient).toMatchObject({ name: 'Jane Doe', sex: 'F' });
  });
});

describe('critical results', () => {
  it('announces a critical value to the clinicians, once entered, and a failure to announce does not undo it', async () => {
    const { svc, prisma, notifications } = setup();
    prisma.labOrder.findFirst.mockResolvedValue({ id: 'o-1', businessId: 'biz-1', patientId: 'pt-1', visitId: 'v-1', status: 'COLLECTED', orderedByName: 'Dr Doe' });
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 5.5 } }, TECH);
    expect(notifications.createNotification).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', type: 'LAB_CRITICAL', priority: 'HIGH', entityId: 'o-1', body: expect.stringContaining('Jane Doe: Haemoglobin 5.5 g/dL') }));
    notifications.createNotification.mockRejectedValue(new Error('down'));
    await expect(svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 5.4 } }, TECH)).resolves.toBeDefined();
  });

  it('says nothing for an ordinary result', async () => {
    const { svc, prisma, notifications } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 14 } }, TECH);
    expect(notifications.createNotification).not.toHaveBeenCalled();
  });

  it('a corrected value clears an earlier acknowledgement, so the new one is seen again', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem());
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 5 } }, TECH);
    expect(prisma.labOrderItem.updateMany.mock.calls[0][0].data).toMatchObject({ criticalAckAt: null, criticalAckBy: null });
  });

  it('a clinician acknowledges once, and only a critical result', async () => {
    const { svc, prisma } = setup();
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem({ status: 'RESULTED', hasCritical: true }));
    await svc.acknowledgeCritical('biz-1', 'o-1', 'i-1', DOCTOR);
    expect(prisma.labOrderItem.updateMany).toHaveBeenCalledWith({ where: { id: 'i-1', orderId: 'o-1', businessId: 'biz-1', hasCritical: true, criticalAckAt: null }, data: { criticalAckAt: expect.any(Date), criticalAckBy: 'Dr Doe' } });
    prisma.labOrderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.acknowledgeCritical('biz-1', 'o-1', 'i-1', DOCTOR)).rejects.toThrow(/already acknowledged/);
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem({ status: 'RESULTED', hasCritical: false }));
    await expect(svc.acknowledgeCritical('biz-1', 'o-1', 'i-1', DOCTOR)).rejects.toThrow(/no critical result/);
  });

  it('a child is judged by the child range', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockResolvedValue({ name: 'Baby', sex: 'M', dateOfBirth: new Date(Date.now() - 5 * 365 * 86_400_000) });
    prisma.labOrderItem.findFirst.mockResolvedValue(pendingItem({ parameters: JSON.stringify([{ name: 'Haemoglobin', kind: 'NUMERIC', unit: 'g/dL', low: 13, high: 17, lowC: 11.5, highC: 15.5 }]) }));
    await svc.saveResults('biz-1', 'o-1', 'i-1', { values: { Haemoglobin: 12 } }, TECH);
    expect(JSON.parse(prisma.labOrderItem.updateMany.mock.calls[0][0].data.results)[0]).toMatchObject({ flag: 'NORMAL', low: 11.5, high: 15.5 });
  });
});
