import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { presentPatient } from '../patients/patient-data';
import { parseDiagnoses } from '../clinic/diagnosis-codes';
import { parseParameters, parseValues } from '../lab/lab-results';
import { CONTROLLED_SCHEDULES } from '../sales/restricted-sale';
import { nairobiDay } from '../common/dates';
import { controlledSummary, medicinesText, parseMedicines, periodOf } from './registers';

const MAX_ROWS = 20_000;

interface Actor { id: string; name: string }

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  /** The controlled-drugs register for a period, with each controlled medicine's total next to the stock the ledger holds now. */
  async controlledRegister(businessId: string, opts: { from?: unknown; to?: unknown }) {
    const p = periodOf(opts.from, opts.to);
    const [entries, items] = await Promise.all([
      this.prisma.controlledSubstanceLog.findMany({ where: { businessId, dispensedAt: { gte: p.from, lte: p.to } }, orderBy: { dispensedAt: 'asc' }, take: MAX_ROWS + 1 }),
      this.prisma.item.findMany({ where: { businessId, scheduleClass: { in: [...CONTROLLED_SCHEDULES] } }, select: { id: true, name: true, scheduleClass: true } }),
    ]);
    const truncated = entries.length > MAX_ROWS;
    const rows = truncated ? entries.slice(0, MAX_ROWS) : entries;
    const stock = items.length
      ? await this.prisma.inventoryMovement.groupBy({ by: ['itemId'], where: { businessId, itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } })
      : [];
    const onHand = new Map(stock.map((s) => [s.itemId, Math.round((s._sum.quantity ?? 0) * 1000) / 1000]));
    const rxIds = [...new Set(rows.map((r) => r.prescriptionId).filter((x): x is string => !!x))];
    const rxs = rxIds.length ? await this.prisma.prescription.findMany({ where: { businessId, id: { in: rxIds } }, select: { id: true, prescriptionNumber: true } }) : [];
    const rxNumber = new Map(rxs.map((r) => [r.id, r.prescriptionNumber]));
    return {
      period: { from: p.fromDay, to: p.toDay },
      truncated,
      entries: rows.map((r) => ({
        date: r.dispensedAt, itemName: r.itemName, scheduleClass: r.scheduleClass, quantity: r.quantityDispensed, unit: r.unit, patientName: r.patientName, patientIdNumber: r.patientIdNumber,
        prescriberName: r.prescriberName, prescriberLicense: r.prescriberLicense, dispensedBy: r.dispensedBy, prescriptionNumber: r.prescriptionId ? rxNumber.get(r.prescriptionId) ?? null : null, notes: r.notes,
      })),
      summary: controlledSummary(rows.map((r) => ({ itemName: r.itemName, quantityDispensed: r.quantityDispensed, dispensedAt: r.dispensedAt })), items.map((i) => ({ name: i.name, scheduleClass: i.scheduleClass, onHand: onHand.get(i.id) ?? 0 }))),
    };
  }

  /** Every prescription whose latest fill fell in the period: who, what, by whom. */
  async dispensingRegister(businessId: string, opts: { from?: unknown; to?: unknown }) {
    const p = periodOf(opts.from, opts.to);
    const rows = await this.prisma.prescription.findMany({
      where: { businessId, status: 'DISPENSED', lastFillDate: { gte: p.from, lte: p.to } },
      orderBy: { lastFillDate: 'asc' },
      take: MAX_ROWS + 1,
    });
    const truncated = rows.length > MAX_ROWS;
    return {
      period: { from: p.fromDay, to: p.toDay },
      truncated,
      entries: (truncated ? rows.slice(0, MAX_ROWS) : rows).map((r) => ({
        date: r.lastFillDate, prescriptionNumber: r.prescriptionNumber, patientName: r.patientName, patientIdNumber: r.patientIdNumber, prescriberName: r.doctorName, prescriberLicense: r.doctorLicense,
        medicines: medicinesText(parseMedicines(r.items)), fills: r.refillsUsed + 1, dispensedBy: r.dispensedBy,
      })),
    };
  }

  /** Stock written off as expired, damaged or recalled (approved write-offs) in the period, with the lot where one was named. */
  async disposalRegister(businessId: string, opts: { from?: unknown; to?: unknown }) {
    const p = periodOf(opts.from, opts.to);
    const rows = await this.prisma.damagedGoodsRecord.findMany({
      where: { businessId, status: 'APPROVED', createdAt: { gte: p.from, lte: p.to } },
      include: { item: { select: { name: true, scheduleClass: true } } },
      orderBy: { createdAt: 'asc' },
      take: MAX_ROWS + 1,
    });
    const truncated = rows.length > MAX_ROWS;
    const list = truncated ? rows.slice(0, MAX_ROWS) : rows;
    return {
      period: { from: p.fromDay, to: p.toDay },
      truncated,
      totalCostCents: list.reduce((s, r) => s + r.costCents, 0),
      entries: list.map((r) => ({ date: r.createdAt, itemName: r.item.name, scheduleClass: r.item.scheduleClass, quantity: r.quantity, costCents: r.costCents, reason: r.reason, notes: r.notes, submittedBy: r.submittedBy, authorizedBy: r.authorizedBy })),
    };
  }

  /**
   * Everything held about one patient, for a data access request: the record, visits and notes, prescriptions, lab results,
   * cover checks and claims. Who took it and when goes on the tamper-evident audit log, because it is the most sensitive thing
   * the system can hand over.
   */
  async patientExport(businessId: string, patientId: string, actor: Actor) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, businessId } });
    if (!patient) throw new NotFoundException('Patient not found');
    const [visits, prescriptions, labOrders, coverChecks] = await Promise.all([
      this.prisma.visit.findMany({ where: { businessId, patientId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.prescription.findMany({ where: { businessId, patientId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.labOrder.findMany({ where: { businessId, patientId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.coverCheck.findMany({ where: { businessId, patientId }, orderBy: { checkedAt: 'asc' } }),
    ]);
    const [labItems, claims] = await Promise.all([
      labOrders.length ? this.prisma.labOrderItem.findMany({ where: { businessId, orderId: { in: labOrders.map((o) => o.id) } }, orderBy: { createdAt: 'asc' } }) : [],
      this.prisma.insuranceClaim.findMany({ where: { businessId, OR: [{ patientId }, ...(prescriptions.length ? [{ prescriptionId: { in: prescriptions.map((r) => r.id) } }] : [])] }, orderBy: { createdAt: 'asc' } }),
    ]);

    const bundle = {
      exportedAt: new Date().toISOString(),
      exportedBy: actor.name,
      patient: presentPatient(patient),
      visits: visits.map((v) => ({ ...v, diagnoses: parseDiagnoses(v.diagnoses) })),
      prescriptions: prescriptions.map((r) => ({ ...r, items: parseMedicines(r.items) })),
      labOrders: labOrders.map((o) => ({ ...o, items: labItems.filter((i) => i.orderId === o.id).map((i) => ({ ...i, parameters: parseParameters(i.parameters), results: parseValues(i.results) })) })),
      coverChecks,
      claims: claims.map((c) => ({ ...c, diagnoses: parseDiagnoses(c.diagnoses) })),
    };
    await this.audit.createEntry({
      businessId, actor: actor.id, actorType: 'USER', action: 'PATIENT_DATA_EXPORT', entity: 'Patient', entityId: patientId,
      after: { patientNumber: patient.patientNumber, day: nairobiDay(new Date()), visits: visits.length, prescriptions: prescriptions.length, labOrders: labOrders.length, claims: claims.length },
      source: 'POS',
    });
    return bundle;
  }
}
