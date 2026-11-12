import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { cleanDiagnoses, parseDiagnoses, searchDiagnoses } from './diagnosis-codes';
import { assertCan, queueOrder } from './visit-flow';
import { hasAnyVital, vitalsData } from './vitals';
import { consultationData, VisitsService } from './visits.service';

describe('vitals', () => {
  it('keeps numbers in range and only what was sent', () => {
    expect(vitalsData({ temperatureC: '37.8', pulse: 88, systolic: 120, diastolic: 80, spo2: 98 })).toEqual({ temperatureC: 37.8, pulse: 88, systolic: 120, diastolic: 80, spo2: 98 });
    expect(vitalsData({ weightKg: '' })).toEqual({ weightKg: null });
    expect(hasAnyVital({ pulse: 70 })).toBe(true);
    expect(hasAnyVital({ pulse: null, triageNotes: 'x' })).toBe(false);
  });

  it('catches a slipped decimal', () => {
    expect(() => vitalsData({ temperatureC: 370 })).toThrow(/Temperature/);
    expect(() => vitalsData({ pulse: 7 })).toThrow(/Pulse/);
    expect(() => vitalsData({ spo2: 101 })).toThrow(/Oxygen/);
    expect(() => vitalsData({ painScore: 11 })).toThrow(/Pain/);
    expect(() => vitalsData({ weightKg: 0.1 })).toThrow(/Weight/);
  });

  it('a blood pressure is two numbers with the top one higher', () => {
    expect(() => vitalsData({ systolic: 120 })).toThrow(/both numbers/);
    expect(() => vitalsData({ systolic: 120, diastolic: null })).toThrow(/both numbers/);
    expect(() => vitalsData({ systolic: 80, diastolic: 80 })).toThrow(/higher/);
    expect(vitalsData({ systolic: null, diastolic: null })).toEqual({ systolic: null, diastolic: null });
  });
});

describe('visit flow', () => {
  it('allows each action only from the right status, and says where it leads', () => {
    expect(assertCan('startConsultation', 'TRIAGED')).toBe('IN_CONSULTATION');
    expect(assertCan('startConsultation', 'WAITING')).toBe('IN_CONSULTATION');
    expect(assertCan('finishConsultation', 'IN_CONSULTATION')).toBe('READY_TO_BILL');
    expect(assertCan('complete', 'READY_TO_BILL')).toBe('COMPLETED');
    expect(assertCan('vitals', 'TRIAGED')).toBeUndefined();
    expect(() => assertCan('complete', 'IN_CONSULTATION')).toThrow(BadRequestException);
    expect(() => assertCan('startConsultation', 'READY_TO_BILL')).toThrow(/waiting patient/);
    expect(() => assertCan('consultation', 'WAITING')).toThrow(/with the doctor/);
    expect(() => assertCan('cancel', 'COMPLETED')).toThrow(/cannot be cancelled/);
    expect(() => assertCan('charge', 'CANCELLED')).toThrow(/completed/);
  });

  it('sees urgent first, then the longest wait', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 10, 12, 8, m));
    const order = queueOrder([
      { id: 'late', priority: 'NORMAL', createdAt: t(30) },
      { id: 'early', priority: 'NORMAL', createdAt: t(5) },
      { id: 'urgent-late', priority: 'URGENT', createdAt: t(40) },
      { id: 'urgent-early', priority: 'URGENT', createdAt: t(10) },
    ]);
    expect(order.map((o) => o.id)).toEqual(['urgent-early', 'urgent-late', 'early', 'late']);
  });
});

describe('diagnoses', () => {
  it('searches by code or any word, and offers a starting set when empty', () => {
    expect(searchDiagnoses('malaria').map((d) => d.code)).toEqual(expect.arrayContaining(['B50.9', 'B54']));
    expect(searchDiagnoses('j06')[0].code).toBe('J06.9');
    expect(searchDiagnoses('upper resp')[0].code).toBe('J06.9');
    expect(searchDiagnoses('zzzz')).toEqual([]);
    expect(searchDiagnoses('').length).toBeGreaterThan(5);
  });

  it('cleans what a doctor sent: label, optional ICD-10 code, no repeats, at most ten', () => {
    expect(cleanDiagnoses([{ code: 'j06.9', label: 'URTI' }, 'Malaria', { code: 'J06.9', label: 'again' }])).toEqual([{ code: 'J06.9', label: 'URTI' }, { label: 'Malaria' }]);
    expect(() => cleanDiagnoses([{ code: 'not a code', label: 'x' }])).toThrow(/ICD-10/);
    expect(() => cleanDiagnoses('malaria')).toThrow(/list/);
    expect(() => cleanDiagnoses(Array.from({ length: 11 }, (_, i) => `d${i}`))).toThrow(/At most 10/);
    expect(parseDiagnoses('[{"label":"x"}]')).toEqual([{ label: 'x' }]);
    expect(parseDiagnoses('garbage')).toEqual([]);
  });
});

describe('consultationData', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('takes only what was sent, clears blanks', () => {
    expect(consultationData({ subjective: ' cough for 3 days ', plan: '' }, now)).toEqual({ subjective: 'cough for 3 days', plan: null });
  });
  it('sick leave is 1 to 90 days; follow-up is a real day not in the past', () => {
    expect(consultationData({ sickLeaveDays: '3' }, now)).toEqual({ sickLeaveDays: 3 });
    expect(() => consultationData({ sickLeaveDays: 0 }, now)).toThrow(/Sick leave/);
    expect(() => consultationData({ sickLeaveDays: 100 }, now)).toThrow(/Sick leave/);
    expect((consultationData({ followUpDate: '2026-11-20' }, now).followUpDate as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(() => consultationData({ followUpDate: '2026-02-31' }, now)).toThrow(/Follow-up/);
    expect(() => consultationData({ followUpDate: '2026-10-01' }, now)).toThrow(/past/);
    expect(consultationData({ followUpDate: '' }, now)).toEqual({ followUpDate: null });
  });
  it('refuses an empty change', () => {
    expect(() => consultationData({}, now)).toThrow(/Nothing to change/);
  });
});

// ── the service ──────────────────────────────────────────────────────────────────────────────────────────────────────

const DOCTOR = { id: 'u-doc', name: 'Dr Doe', role: 'DOCTOR' };
const OTHER_DOCTOR = { id: 'u-doc2', name: 'Dr Roe', role: 'DOCTOR' };
const MANAGER = { id: 'u-mgr', name: 'Grace', role: 'MANAGER' };
const NURSE = { id: 'u-cash', name: 'Peter', role: 'CASHIER' };

function makeVisit(o: Record<string, any> = {}) {
  return { id: 'v-1', businessId: 'biz-1', storeId: 'store-1', patientId: 'pt-1', visitNumber: 'V-20261112-001', status: 'WAITING', priority: 'NORMAL', doctorId: null, doctorName: null, diagnoses: '[]', ...o };
}

function setup(opts: { invoice?: boolean } = {}) {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt-1', name: 'Jane Doe', phone: '0711', allergies: '[]', conditions: '[]', dateOfBirth: null, isActive: true }), findMany: jest.fn().mockResolvedValue([]) },
    visit: { findFirst: jest.fn().mockResolvedValue(makeVisit()), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'v-new', ...data })), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    visitCharge: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    prescription: { findMany: jest.fn().mockResolvedValue([]) },
    item: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(!!opts.invoice),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => ({ sale: { id: 'sale-1', receiptNumber: 'NRB-0001', totalCents: input.lines.reduce((s: number, l: any) => s + l.totalCents, 0), status: 'PAID' }, isCredit: false, payments: input.payments })),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CN-1' }) }),
  };
  return { prisma: p, directSales, svc: new VisitsService(p, directSales) };
}
const statusOf = (v: any, status: string) => v.visit.findFirst.mockResolvedValue(makeVisit({ status, doctorId: 'u-doc', doctorName: 'Dr Doe', diagnoses: '[{"label":"Malaria"}]' }));

describe('VisitsService.create', () => {
  it('queues a patient, numbering the visit for the day', async () => {
    const { svc, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ visitNumber: 'V-20261112-004' });
    const v: any = await svc.create('biz-1', 'store-1', { patientId: 'pt-1', complaint: ' fever ', priority: 'urgent' }, NURSE);
    expect(v.visitNumber).toMatch(/^V-\d{8}-005$/);
    expect(v).toMatchObject({ businessId: 'biz-1', patientId: 'pt-1', complaint: 'fever', priority: 'URGENT', createdBy: 'Peter' });
  });

  it('refuses a patient from another business or switched off', async () => {
    const { svc, prisma } = setup();
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(svc.create('biz-1', 'store-1', { patientId: 'pt-x' }, NURSE)).rejects.toThrow(/Patient not found/);
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({ where: { id: 'pt-x', businessId: 'biz-1', isActive: true } });
  });

  it('does not queue a patient who already has an open visit', async () => {
    const { svc, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValue({ visitNumber: 'V-20261112-002' });
    await expect(svc.create('biz-1', 'store-1', { patientId: 'pt-1' }, NURSE)).rejects.toThrow(ConflictException);
    expect(prisma.visit.create).not.toHaveBeenCalled();
  });

  it('retries the number when two are queued at once', async () => {
    const { svc, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValue(null);
    prisma.visit.create.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'P2002' }));
    await svc.create('biz-1', 'store-1', { patientId: 'pt-1' }, NURSE);
    expect(prisma.visit.create).toHaveBeenCalledTimes(2);
  });
});

describe('VisitsService triage and consultation', () => {
  it('vitals move a waiting patient to triaged and record who took them', async () => {
    const { svc, prisma } = setup();
    await svc.saveVitals('v-1', 'biz-1', { temperatureC: 38.4, pulse: 96 }, NURSE);
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: { id: 'v-1', businessId: 'biz-1', status: { in: ['WAITING', 'TRIAGED', 'IN_CONSULTATION'] } }, data: expect.objectContaining({ temperatureC: 38.4, pulse: 96, status: 'TRIAGED', triagedBy: 'Peter' }) });
  });

  it('vitals are refused on a finished visit', async () => {
    const { svc, prisma } = setup();
    statusOf(prisma, 'COMPLETED');
    await expect(svc.saveVitals('v-1', 'biz-1', { pulse: 80 }, NURSE)).rejects.toThrow(/until the visit is finished/);
  });

  it('only a doctor or manager takes a patient in, and a lost race is reported', async () => {
    const { svc, prisma } = setup();
    await expect(svc.start('v-1', 'biz-1', NURSE)).rejects.toThrow(ForbiddenException);
    await svc.start('v-1', 'biz-1', DOCTOR);
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: { in: ['WAITING', 'TRIAGED'] } }), data: expect.objectContaining({ status: 'IN_CONSULTATION', doctorId: 'u-doc', doctorName: 'Dr Doe' }) });
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.start('v-1', 'biz-1', DOCTOR)).rejects.toThrow(/Another doctor just took/);
  });

  it('only the doctor who has the patient (or a manager) changes the notes', async () => {
    const { svc, prisma } = setup();
    statusOf(prisma, 'IN_CONSULTATION');
    await expect(svc.saveConsultation('v-1', 'biz-1', { plan: 'rest' }, OTHER_DOCTOR)).rejects.toThrow(/Dr Doe has this patient/);
    await svc.saveConsultation('v-1', 'biz-1', { plan: 'rest' }, DOCTOR);
    await svc.saveConsultation('v-1', 'biz-1', { plan: 'rest more' }, MANAGER);
    expect(prisma.visit.updateMany).toHaveBeenCalledTimes(2);
  });

  it('notes are only written while the patient is with the doctor', async () => {
    const { svc } = setup();
    await expect(svc.saveConsultation('v-1', 'biz-1', { plan: 'x' }, DOCTOR)).rejects.toThrow(/with the doctor/);
  });

  it('finishing needs a diagnosis', async () => {
    const { svc, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValue(makeVisit({ status: 'IN_CONSULTATION', doctorId: 'u-doc', diagnoses: '[]' }));
    await expect(svc.finish('v-1', 'biz-1', DOCTOR)).rejects.toThrow(/at least one diagnosis/);
    statusOf(prisma, 'IN_CONSULTATION');
    await svc.finish('v-1', 'biz-1', DOCTOR);
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ status: { in: ['IN_CONSULTATION'] } }), data: expect.objectContaining({ status: 'READY_TO_BILL' }) });
  });

  it('a visit in another business is not found', async () => {
    const { svc, prisma } = setup();
    prisma.visit.findFirst.mockResolvedValue(null);
    await expect(svc.get('v-x', 'biz-1')).rejects.toThrow(NotFoundException);
    expect(prisma.visit.findFirst).toHaveBeenCalledWith({ where: { id: 'v-x', businessId: 'biz-1' } });
  });
});

describe('VisitsService charges and billing', () => {
  const CONSULT = { id: 'item-c', businessId: 'biz-1', name: 'Consultation', type: 'SERVICE', retailPriceCents: 50000, taxClass: 'A' };

  it('charges a catalogue service at its price, and refuses a product or an unpriced service', async () => {
    const { svc, prisma } = setup();
    prisma.item.findFirst.mockResolvedValue(CONSULT);
    await svc.addCharge('v-1', 'biz-1', { itemId: 'item-c', quantity: 2 }, NURSE);
    expect(prisma.visitCharge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ visitId: 'v-1', itemId: 'item-c', quantity: 2, unitPriceCents: 50000, name: 'Consultation' }) });
    prisma.item.findFirst.mockResolvedValue({ ...CONSULT, type: 'PRODUCT' });
    await expect(svc.addCharge('v-1', 'biz-1', { itemId: 'item-c' }, NURSE)).rejects.toThrow(/medicines are billed when they are dispensed/);
    prisma.item.findFirst.mockResolvedValue({ ...CONSULT, retailPriceCents: 0 });
    await expect(svc.addCharge('v-1', 'biz-1', { itemId: 'item-c' }, NURSE)).rejects.toThrow(/no price/);
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(svc.addCharge('v-1', 'biz-1', { itemId: 'nope' }, NURSE)).rejects.toThrow(/not in the catalogue/);
  });

  it('no charges can be added once the visit is completed', async () => {
    const { svc, prisma } = setup();
    statusOf(prisma, 'COMPLETED');
    await expect(svc.addCharge('v-1', 'biz-1', { itemId: 'item-c' }, NURSE)).rejects.toThrow(/until the visit is completed/);
  });

  it('completing before real sales just closes the visit', async () => {
    const { svc, prisma, directSales } = setup({ invoice: false });
    statusOf(prisma, 'READY_TO_BILL');
    prisma.visitCharge.findMany.mockResolvedValue([{ id: 'c1', itemId: 'item-c', name: 'Consultation', quantity: 1, unitPriceCents: 50000 }]);
    const r: any = await svc.complete('v-1', 'biz-1', NURSE);
    expect(directSales.createInTx).not.toHaveBeenCalled();
    expect(r.invoice).toBeNull();
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: { id: 'v-1', businessId: 'biz-1', status: 'READY_TO_BILL' }, data: expect.objectContaining({ status: 'COMPLETED' }) });
  });

  it('on real sales the charges become one invoice, priced from the visit, in the same transaction', async () => {
    const { svc, prisma, directSales } = setup({ invoice: true });
    statusOf(prisma, 'READY_TO_BILL');
    prisma.visitCharge.findMany.mockResolvedValue([
      { id: 'c1', itemId: 'item-c', name: 'Consultation', quantity: 1, unitPriceCents: 50000 },
      { id: 'c2', itemId: 'item-l', name: 'Malaria test', quantity: 1, unitPriceCents: 30000 },
    ]);
    prisma.item.findMany.mockResolvedValue([{ id: 'item-c', taxClass: 'A' }, { id: 'item-l', taxClass: 'A' }]);
    const r: any = await svc.complete('v-1', 'biz-1', NURSE, { payments: [{ method: 'cash', amountCents: 100000 }], buyerKraPin: 'a012345678z' });
    const [tx, input] = directSales.createInTx.mock.calls[0];
    expect(tx).toBe(prisma);
    expect(input).toEqual(expect.objectContaining({ source: 'CLINIC', cashierId: 'u-cash', customerName: 'Jane Doe', buyerKraPin: 'A012345678Z', notes: 'Visit V-20261112-001', payments: [{ method: 'CASH', amountCents: 100000 }] }));
    expect(input.lines.map((l: any) => l.totalCents)).toEqual([50000, 30000]);
    expect(r.invoice.id).toBe('sale-1');
    expect(r.etims).toEqual({ success: true, controlNumber: 'CN-1' });
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: { id: 'v-1', businessId: 'biz-1' }, data: { saleId: 'sale-1' } });
  });

  it('refuses a bad payment or PIN before closing anything', async () => {
    const { svc, prisma } = setup({ invoice: true });
    statusOf(prisma, 'READY_TO_BILL');
    prisma.visitCharge.findMany.mockResolvedValue([{ id: 'c1', itemId: 'item-c', name: 'Consultation', quantity: 1, unitPriceCents: 50000 }]);
    prisma.item.findMany.mockResolvedValue([{ id: 'item-c', taxClass: 'A' }]);
    await expect(svc.complete('v-1', 'biz-1', NURSE, { payments: [{ method: 'barter', amountCents: 5 }] })).rejects.toThrow(/Payment method/);
    await expect(svc.complete('v-1', 'biz-1', NURSE, { payments: [{ method: 'CASH', amountCents: 50000 }], buyerKraPin: 'X1' })).rejects.toThrow(/KRA PIN/);
    expect(prisma.visit.updateMany).not.toHaveBeenCalled();
  });

  it('only a visit that finished its consultation can be completed', async () => {
    const { svc, prisma } = setup();
    statusOf(prisma, 'IN_CONSULTATION');
    await expect(svc.complete('v-1', 'biz-1', NURSE)).rejects.toThrow(/finished its consultation/);
  });

  it('a lost race on completing does not invoice twice', async () => {
    const { svc, prisma, directSales } = setup({ invoice: true });
    statusOf(prisma, 'READY_TO_BILL');
    prisma.visitCharge.findMany.mockResolvedValue([{ id: 'c1', itemId: 'item-c', name: 'C', quantity: 1, unitPriceCents: 100 }]);
    prisma.item.findMany.mockResolvedValue([{ id: 'item-c', taxClass: 'A' }]);
    prisma.visit.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.complete('v-1', 'biz-1', NURSE, { payments: [{ method: 'CASH', amountCents: 100 }] })).rejects.toThrow(/just completed by someone else/);
    expect(directSales.createInTx).not.toHaveBeenCalled();
  });

  it('cancelling needs a reason and is refused after completion', async () => {
    const { svc, prisma } = setup();
    await expect(svc.cancel('v-1', 'biz-1', '')).rejects.toThrow(/Reason/);
    await svc.cancel('v-1', 'biz-1', 'Patient left');
    expect(prisma.visit.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'v-1' }), data: { status: 'CANCELLED', cancelReason: 'Patient left' } });
    statusOf(prisma, 'COMPLETED');
    await expect(svc.cancel('v-1', 'biz-1', 'oops')).rejects.toThrow(/cannot be cancelled/);
  });
});

describe('VisitsService.board', () => {
  it('puts urgent first and attaches the patient with allergies', async () => {
    const { svc, prisma } = setup();
    const at = (m: number) => new Date(Date.UTC(2026, 10, 12, 8, m));
    prisma.visit.findMany.mockResolvedValue([
      makeVisit({ id: 'a', status: 'WAITING', createdAt: at(1), patientId: 'pt-1' }),
      makeVisit({ id: 'b', status: 'WAITING', priority: 'URGENT', createdAt: at(9), patientId: 'pt-1' }),
      makeVisit({ id: 'c', status: 'COMPLETED', createdAt: at(0), patientId: 'pt-1' }),
    ]);
    prisma.patient.findMany.mockResolvedValue([{ id: 'pt-1', name: 'Jane', patientNumber: 'PT-0001', phone: null, sex: 'F', allergies: '[{"substance":"Penicillin"}]', conditions: '[]', dateOfBirth: null, pregnant: false, weightKg: null }]);
    const board: any = await svc.board('biz-1', 'store-1');
    expect(board.open.map((v: any) => v.id)).toEqual(['b', 'a']);
    expect(board.closed.map((v: any) => v.id)).toEqual(['c']);
    expect(board.open[0].patient.allergies).toEqual([{ substance: 'Penicillin' }]);
  });
});
