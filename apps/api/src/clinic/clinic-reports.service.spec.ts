import { BadRequestException } from '@nestjs/common';
import { ClinicReportsService } from './clinic-reports.service';

const visit = (o: Record<string, unknown> = {}) => ({
  id: 'v1', status: 'COMPLETED', priority: 'NORMAL', createdAt: new Date('2026-11-10T06:00:00Z'), triagedAt: null, consultStartedAt: new Date('2026-11-10T06:30:00Z'), consultEndedAt: new Date('2026-11-10T06:50:00Z'),
  completedAt: null, doctorId: 'd1', doctorName: 'Dr Doe', patientId: 'p1', diagnoses: '[{"code":"B54","label":"Malaria"}]', ...o,
});

function setup(visits: unknown[] = [visit()]) {
  const p: any = {
    visit: { findMany: jest.fn().mockResolvedValue(visits) },
    patient: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', sex: 'F', dateOfBirth: new Date('1990-01-01') }]) },
    visitCharge: { findMany: jest.fn().mockResolvedValue([{ visitId: 'v1', name: 'Consultation', quantity: 1, unitPriceCents: 50000 }]) },
    labOrder: { findMany: jest.fn().mockResolvedValue([{ id: 'o1' }]) },
    labOrderItem: { findMany: jest.fn().mockResolvedValue([{ testName: 'Hb', status: 'VERIFIED', hasCritical: false, createdAt: new Date('2026-11-10T06:00:00Z'), verifiedAt: new Date('2026-11-10T07:00:00Z') }]) },
  };
  return { prisma: p, svc: new ClinicReportsService(p) };
}

describe('ClinicReportsService.summary', () => {
  it('puts the period\'s figures together, scoped to the business and the Nairobi days asked for', async () => {
    const { svc, prisma } = setup();
    const r = await svc.summary('biz-1', { from: '2026-11-09', to: '2026-11-11', storeId: 'store-1' });
    expect(prisma.visit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'biz-1', storeId: 'store-1', createdAt: { gte: new Date('2026-11-08T21:00:00.000Z'), lte: new Date('2026-11-11T20:59:59.999Z') } } }));
    expect(r.totals).toEqual({ visits: 1, completed: 1, cancelled: 0, open: 0, urgent: 0 });
    expect(r.perDay.map((d) => [d.date, d.total])).toEqual([['2026-11-09', 0], ['2026-11-10', 1], ['2026-11-11', 0]]);
    expect(r.diagnoses[0]).toMatchObject({ code: 'B54', total: 1, fiveAndOver: 1 });
    expect(r.doctors[0]).toMatchObject({ doctorName: 'Dr Doe', seen: 1 });
    expect(r.revenue.totalCents).toBe(50000);
    expect(r.lab).toMatchObject({ totalOrdered: 1, totalReleased: 1 });
    expect(r.truncated).toBe(false);
    expect(prisma.visitCharge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'biz-1', visitId: { in: ['v1'] } } }));
    expect(prisma.labOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1', status: { not: 'CANCELLED' } }) }));
  });

  it('only charges completed visits to revenue', async () => {
    const { svc, prisma } = setup([visit({ id: 'a', status: 'WAITING' })]);
    await svc.summary('biz-1', {});
    expect(prisma.visitCharge.findMany).not.toHaveBeenCalled();
  });

  it('says so when there were too many visits to count them all', async () => {
    const many = Array.from({ length: 20_001 }, (_, i) => visit({ id: `v${i}`, status: 'WAITING', patientId: `p${i % 10}` }));
    const { svc } = setup(many);
    const r = await svc.summary('biz-1', {});
    expect(r.truncated).toBe(true);
    expect(r.totals.visits).toBe(20_000);
  });

  it('refuses a bad period before touching the database', async () => {
    const { svc, prisma } = setup();
    await expect(svc.summary('biz-1', { from: 'yesterday' })).rejects.toThrow(BadRequestException);
    expect(prisma.visit.findMany).not.toHaveBeenCalled();
  });
});
