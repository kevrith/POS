import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CoverService } from './cover.service';

const ACTOR = { id: 'u-1', name: 'Peter' };

function setup() {
  const p: any = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt-1', insuranceProviderId: null, insuranceMemberNumber: null }), findMany: jest.fn().mockResolvedValue([{ id: 'pt-1', name: 'Jane Doe' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    insuranceProvider: { findFirst: jest.fn().mockResolvedValue({ id: 'sha' }), findMany: jest.fn().mockResolvedValue([]) },
    visit: { findFirst: jest.fn().mockResolvedValue({ id: 'v-1' }) },
    coverCheck: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'chk-1', ...data })), findMany: jest.fn().mockResolvedValue([]) },
    insuranceClaim: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    prescription: { findMany: jest.fn().mockResolvedValue([]) },
    visitCharge: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    saleItem: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma: p, svc: new CoverService(p) };
}

describe('CoverService.recordCheck', () => {
  const dto = { patientId: 'pt-1', providerId: 'sha', memberNumber: ' SHA-123 ', status: 'eligible', visitId: 'v-1' };

  it('keeps the answer with who gave it and when, for this visit', async () => {
    const { svc, prisma } = setup();
    const c: any = await svc.recordCheck('biz-1', dto, ACTOR);
    expect(prisma.coverCheck.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: 'biz-1', patientId: 'pt-1', providerId: 'sha', visitId: 'v-1', memberNumber: 'SHA-123', status: 'ELIGIBLE', method: 'MANUAL', checkedBy: 'u-1', checkedByName: 'Peter' }) });
    expect(c.status).toBe('ELIGIBLE');
  });

  it('puts an eligible insurer on a patient who had none, and leaves an existing one alone', async () => {
    const a = setup();
    await a.svc.recordCheck('biz-1', dto, ACTOR);
    expect(a.prisma.patient.updateMany).toHaveBeenCalledWith({ where: { id: 'pt-1', businessId: 'biz-1' }, data: { insuranceProviderId: 'sha', insuranceMemberNumber: 'SHA-123' } });
    const b = setup();
    b.prisma.patient.findFirst.mockResolvedValue({ id: 'pt-1', insuranceProviderId: 'other', insuranceMemberNumber: '99' });
    await b.svc.recordCheck('biz-1', dto, ACTOR);
    expect(b.prisma.patient.updateMany).not.toHaveBeenCalled();
    const c = setup();
    await c.svc.recordCheck('biz-1', { ...dto, status: 'NOT_ELIGIBLE' }, ACTOR);
    expect(c.prisma.patient.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a made-up result, a missing member number, an unknown patient, insurer or visit', async () => {
    const { svc, prisma } = setup();
    await expect(svc.recordCheck('biz-1', { ...dto, status: 'maybe' }, ACTOR)).rejects.toThrow(/Result/);
    await expect(svc.recordCheck('biz-1', { ...dto, memberNumber: ' ' }, ACTOR)).rejects.toThrow(/Member number/);
    prisma.insuranceProvider.findFirst.mockResolvedValueOnce(null);
    await expect(svc.recordCheck('biz-1', dto, ACTOR)).rejects.toThrow(BadRequestException);
    prisma.patient.findFirst.mockResolvedValueOnce(null);
    await expect(svc.recordCheck('biz-1', dto, ACTOR)).rejects.toThrow(NotFoundException);
    prisma.visit.findFirst.mockResolvedValueOnce(null);
    await expect(svc.recordCheck('biz-1', dto, ACTOR)).rejects.toThrow(/not this patient/);
    expect(prisma.coverCheck.create).not.toHaveBeenCalled();
  });
});

describe('CoverService.claims', () => {
  const claim = (o: Record<string, unknown> = {}) => ({
    id: 'cl-1', businessId: 'biz-1', status: 'SUBMITTED', providerId: 'sha', provider: { name: 'SHA', kind: 'SHA', requiresEligibility: true },
    patientId: 'pt-1', patientInsuranceId: 'SHA-123', visitId: 'v-1', prescriptionId: null, saleId: 's-1', coverCheckId: 'chk-1',
    diagnoses: '[{"label":"Malaria","code":"B54","icd11":"1F40"}]', billedCents: 64000, approvedCents: 0, paidCents: 0, copayPct: 20,
    submittedAt: new Date(Date.now() - 5 * 86_400_000), createdAt: new Date(), claimNumber: null, preauthNumber: null, rejectionReason: null, paidAt: null, ...o,
  });

  it('shows a complete claim as ready', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceClaim.findMany.mockResolvedValue([claim()]);
    prisma.coverCheck.findMany.mockResolvedValue([{ id: 'chk-1', status: 'ELIGIBLE' }]);
    prisma.visitCharge.groupBy.mockResolvedValue([{ visitId: 'v-1', _count: 2 }]);
    const [c] = await svc.claims('biz-1');
    expect(c).toMatchObject({ patientName: 'Jane Doe', providerName: 'SHA', ageDays: 5, problems: [] });
  });

  it('says what holds a claim back: no confirmed cover, no ICD-11 code, no member number', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceClaim.findMany.mockResolvedValue([claim({ coverCheckId: null, patientInsuranceId: null, diagnoses: '[{"label":"Malaria","code":"B54"}]' })]);
    prisma.visitCharge.groupBy.mockResolvedValue([{ visitId: 'v-1', _count: 2 }]);
    const [c] = await svc.claims('biz-1');
    expect(c.problems).toEqual(expect.arrayContaining(['Member number is missing', 'Cover has not been confirmed', 'SHA needs an ICD-11 code on every diagnosis']));
  });

  it('does not ask a pharmacy fill for a visit\'s diagnosis or cover check, and leaves settled claims without problems', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceClaim.findMany.mockResolvedValue([
      claim({ visitId: null, prescriptionId: 'rx-1', patientId: null, coverCheckId: null, diagnoses: '[]', provider: { name: 'Jubilee', kind: 'PRIVATE', requiresEligibility: true } }),
      claim({ id: 'cl-2', status: 'PAID', coverCheckId: null }),
    ]);
    prisma.prescription.findMany.mockResolvedValue([{ id: 'rx-1', patientName: 'Sam Roe' }]);
    const rows = await svc.claims('biz-1');
    expect(rows[0]).toMatchObject({ patientName: 'Sam Roe', problems: [] });
    expect(rows[1]).toMatchObject({ status: 'PAID', problems: [], ageDays: null });
  });

  it('filters by search text and by ready only', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceClaim.findMany.mockResolvedValue([claim(), claim({ id: 'cl-2', patientInsuranceId: 'ZZ' })]);
    expect(await svc.claims('biz-1', { q: 'zz' })).toHaveLength(1);
    prisma.visitCharge.groupBy.mockResolvedValue([{ visitId: 'v-1', _count: 1 }]);
    expect(await svc.claims('biz-1', { readyOnly: true })).toHaveLength(0);
  });
});

describe('CoverService.aging', () => {
  it('adds up what each insurer owes by age', async () => {
    const { svc, prisma } = setup();
    prisma.insuranceClaim.findMany.mockResolvedValue([{ providerId: 'sha', provider: { name: 'SHA' }, status: 'SUBMITTED', billedCents: 1000, approvedCents: 0, submittedAt: new Date() }]);
    const rows = await svc.aging('biz-1');
    expect(rows).toEqual([expect.objectContaining({ providerName: 'SHA', totalCents: 1000, buckets: expect.objectContaining({ '0-30': 1000 }) })]);
  });
});

describe('CoverService.resubmit', () => {
  const rejected = (o: Record<string, unknown> = {}) => ({ id: 'cl-1', businessId: 'biz-1', status: 'REJECTED', prescriptionId: null, visitId: 'v-1', patientId: 'pt-1', providerId: 'sha', patientInsuranceId: 'OLD-1', billedCents: 64000, copayPct: 20, diagnoses: '[{"label":"Malaria","code":"B54"}]', preauthNumber: null, coverCheckId: 'chk-1', resubmittedToId: null, ...o });
  const prep = (o: Record<string, unknown> = {}) => {
    const h = setup();
    h.prisma.insuranceClaim.findFirst.mockResolvedValue(rejected(o));
    h.prisma.insuranceClaim.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    h.prisma.insuranceClaim.create = jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'cl-2', ...data }));
    h.prisma.$transaction = jest.fn().mockImplementation(async (fn: any) => fn(h.prisma));
    return h;
  };

  it('makes a new submitted claim from the rejected one with the corrections, and links them both ways, with no receivable', async () => {
    const { svc, prisma } = prep();
    const c: any = await svc.resubmit('biz-1', 'cl-1', { memberNumber: ' NEW-9 ', preauthNumber: 'PA-5', diagnoses: [{ label: 'Malaria', code: 'B54', icd11: '1f40' }] });
    expect(prisma.insuranceClaim.create).toHaveBeenCalledWith({ data: expect.objectContaining({ businessId: 'biz-1', visitId: 'v-1', providerId: 'sha', patientInsuranceId: 'NEW-9', preauthNumber: 'PA-5', billedCents: 64000, copayPct: 20, status: 'SUBMITTED', saleId: null, receivableBooked: false, resubmittedFromId: 'cl-1', coverCheckId: 'chk-1', diagnoses: JSON.stringify([{ code: 'B54', icd11: '1F40', label: 'Malaria' }]) }) });
    expect(prisma.insuranceClaim.updateMany).toHaveBeenLastCalledWith({ where: { id: 'cl-1', businessId: 'biz-1' }, data: { resubmittedToId: 'cl-2' } });
    expect(c.id).toBe('cl-2');
  });

  it('keeps what was not corrected', async () => {
    const { svc, prisma } = prep();
    await svc.resubmit('biz-1', 'cl-1', {});
    expect(prisma.insuranceClaim.create).toHaveBeenCalledWith({ data: expect.objectContaining({ patientInsuranceId: 'OLD-1', diagnoses: '[{"label":"Malaria","code":"B54"}]' }) });
  });

  it('only a rejected claim, only once, and a lost race makes nothing', async () => {
    for (const [o, re] of [[{ status: 'PAID' }, /rejected claim/], [{ status: 'SUBMITTED' }, /rejected claim/], [{ resubmittedToId: 'cl-9' }, /already sent again/]] as const) {
      const { svc, prisma } = prep(o);
      await expect(svc.resubmit('biz-1', 'cl-1', {})).rejects.toThrow(re);
      expect(prisma.insuranceClaim.create).not.toHaveBeenCalled();
    }
    const a = prep();
    a.prisma.insuranceClaim.updateMany.mockResolvedValue({ count: 0 });
    await expect(a.svc.resubmit('biz-1', 'cl-1', {})).rejects.toThrow(/just sent again/);
    expect(a.prisma.insuranceClaim.create).not.toHaveBeenCalled();
    const b = prep();
    b.prisma.insuranceClaim.findFirst.mockResolvedValue(null);
    await expect(b.svc.resubmit('biz-1', 'x', {})).rejects.toThrow(NotFoundException);
  });

  it('refuses a made-up diagnosis code before anything is written', async () => {
    const { svc, prisma } = prep();
    await expect(svc.resubmit('biz-1', 'cl-1', { diagnoses: [{ label: 'x', icd11: 'not a code!' }] })).rejects.toThrow(/ICD-11/);
    expect(prisma.insuranceClaim.updateMany).not.toHaveBeenCalled();
  });
});
