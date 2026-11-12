import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  demographics, doctorWorkload, labSummary, resolveRange, revenueByService, statusCounts, topDiagnoses, visitsPerDay, waitStats,
  type ChargeRow, type LabItemRow, type PatientRow, type VisitRow,
} from './clinic-reports';

/** More visits than this in one report and the figures would be from a partial list; say so instead of quietly undercounting. */
const MAX_VISITS = 20_000;
const CHUNK = 5_000;

const chunks = <T>(list: T[], size = CHUNK): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

@Injectable()
export class ClinicReportsService {
  constructor(private prisma: PrismaService) {}

  async summary(businessId: string, opts: { from?: unknown; to?: unknown; storeId?: string } = {}) {
    const range = resolveRange(opts.from, opts.to);
    const storeId = opts.storeId || undefined;
    const rows = await this.prisma.visit.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}), createdAt: { gte: range.start, lte: range.end } },
      select: { id: true, status: true, priority: true, createdAt: true, triagedAt: true, consultStartedAt: true, consultEndedAt: true, completedAt: true, doctorId: true, doctorName: true, patientId: true, diagnoses: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_VISITS + 1,
    });
    const truncated = rows.length > MAX_VISITS;
    const visits: VisitRow[] = truncated ? rows.slice(0, MAX_VISITS) : rows;

    const patientIds = [...new Set(visits.map((v) => v.patientId))];
    const patientRows: PatientRow[] = [];
    for (const ids of chunks(patientIds)) patientRows.push(...(await this.prisma.patient.findMany({ where: { businessId, id: { in: ids } }, select: { id: true, sex: true, dateOfBirth: true } })));
    const patients = new Map(patientRows.map((p) => [p.id, p]));

    const completedIds = visits.filter((v) => v.status === 'COMPLETED').map((v) => v.id);
    const charges: ChargeRow[] = [];
    for (const ids of chunks(completedIds)) charges.push(...(await this.prisma.visitCharge.findMany({ where: { businessId, visitId: { in: ids } }, select: { visitId: true, name: true, quantity: true, unitPriceCents: true } })));

    const orders = await this.prisma.labOrder.findMany({ where: { businessId, ...(storeId ? { storeId } : {}), createdAt: { gte: range.start, lte: range.end }, status: { not: 'CANCELLED' } }, select: { id: true } });
    const labItems: LabItemRow[] = [];
    for (const ids of chunks(orders.map((o) => o.id))) labItems.push(...(await this.prisma.labOrderItem.findMany({ where: { businessId, orderId: { in: ids } }, select: { testName: true, status: true, hasCritical: true, createdAt: true, verifiedAt: true } })));

    const counts = statusCounts(visits);
    return {
      range: { from: range.from, to: range.to },
      truncated,
      totals: { visits: visits.length, completed: counts.COMPLETED ?? 0, cancelled: counts.CANCELLED ?? 0, open: visits.length - (counts.COMPLETED ?? 0) - (counts.CANCELLED ?? 0), urgent: visits.filter((v) => v.priority === 'URGENT').length },
      perDay: visitsPerDay(visits, range.days),
      waits: waitStats(visits),
      diagnoses: topDiagnoses(visits, patients, 30),
      doctors: doctorWorkload(visits),
      demographics: demographics(visits, patients),
      revenue: revenueByService(charges),
      lab: labSummary(labItems),
    };
  }
}
