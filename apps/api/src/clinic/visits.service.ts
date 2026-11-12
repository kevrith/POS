import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { taxClassOf } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, numberInRange, oneOf, optionalKraPin, optionalText, requireArray, text } from '../common/validate';
import { hasTooManyDecimals } from '../common/quantity';
import { DirectSaleService, type DirectSaleInput, type EtimsOutcome } from '../sales/direct-sale.service';
import { presentPatient } from '../patients/patient-data';
import { cleanDiagnoses, parseDiagnoses } from './diagnosis-codes';
import { assertCan, OPEN_STATUSES, PRIORITIES, queueOrder } from './visit-flow';
import { hasAnyVital, vitalsData, type VitalsInput } from './vitals';

export interface Actor { id: string; name: string; role: string }
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
const DOCTOR_ROLES = [...MANAGER_ROLES, 'DOCTOR'];
const MAX_ATTEMPTS = 10;
const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;
const ETIMS_WAIT_MS = 5000;

export interface ConsultationInput {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  diagnoses?: unknown;
  sickLeaveDays?: number | string | null;
  sickLeaveNote?: string | null;
  referralTo?: string | null;
  referralNote?: string | null;
  followUpDate?: string | null;
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

/** The consultation columns to write for what the doctor sent. Only what was sent is touched; blank clears. */
export function consultationData(input: ConsultationInput, now = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, label] of [['subjective', 'History'], ['objective', 'Examination'], ['assessment', 'Assessment'], ['plan', 'Plan'], ['referralTo', 'Referred to'], ['referralNote', 'Referral note'], ['sickLeaveNote', 'Sick leave note']] as const) {
    if (input[key] === undefined) continue;
    out[key] = blank(input[key]) ? null : optionalText(input[key], label, key === 'referralTo' ? 160 : 4000) ?? null;
  }
  if (input.diagnoses !== undefined) out.diagnoses = JSON.stringify(cleanDiagnoses(input.diagnoses));
  if (input.sickLeaveDays !== undefined) out.sickLeaveDays = blank(input.sickLeaveDays) ? null : intInRange(typeof input.sickLeaveDays === 'string' ? Number(input.sickLeaveDays) : input.sickLeaveDays, 'Sick leave (days)', 1, 90);
  if (input.followUpDate !== undefined) {
    if (blank(input.followUpDate)) out.followUpDate = null;
    else {
      const s = String(input.followUpDate);
      const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s.slice(0, 10)) throw new BadRequestException('Follow-up date must look like 2026-12-01');
      if (d.getTime() < now.getTime() - 86_400_000) throw new BadRequestException('Follow-up date cannot be in the past');
      out.followUpDate = d;
    }
  }
  if (Object.keys(out).length === 0) throw new BadRequestException('Nothing to change');
  return out;
}

@Injectable()
export class VisitsService {
  constructor(private prisma: PrismaService, private directSales: DirectSaleService) {}

  /** V-<YYYYMMDD>-<nnn>: per business, per Nairobi day, continuing from the highest issued so a deletion never reuses a number. */
  private async nextNumber(businessId: string): Promise<string> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).replace(/-/g, '');
    const prefix = `V-${day}-`;
    const last = await this.prisma.visit.findFirst({ where: { businessId, visitNumber: { startsWith: prefix } }, orderBy: { visitNumber: 'desc' }, select: { visitNumber: true } });
    const lastSeq = last ? parseInt(last.visitNumber.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(3, '0')}`;
  }

  private async owned(id: string, businessId: string) {
    const v = await this.prisma.visit.findFirst({ where: { id, businessId } });
    if (!v) throw new NotFoundException('Visit not found');
    return v;
  }

  private static needDoctor(actor: Actor) {
    if (!DOCTOR_ROLES.includes(actor.role)) throw new ForbiddenException('Only a doctor or a manager can do this');
  }

  /** Move a visit only if it is still in a state the action allows, so two people pressing at once cannot both win. */
  private async move(id: string, businessId: string, from: readonly string[], data: Record<string, unknown>, message: string) {
    const claimed = await this.prisma.visit.updateMany({ where: { id, businessId, status: { in: [...from] } }, data });
    if (claimed.count !== 1) throw new BadRequestException(message);
  }

  /** Put a patient in the queue. A patient with a visit still open is not queued twice. */
  async create(businessId: string, storeId: string, dto: { patientId?: string; complaint?: string; priority?: string; appointmentId?: string }, actor: Actor) {
    if (typeof storeId !== 'string' || !storeId) throw new BadRequestException('storeId is required');
    const store = await this.prisma.store.findFirst({ where: { id: storeId, businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');
    const patient = await this.prisma.patient.findFirst({ where: { id: text(dto.patientId, 'Patient', 64), businessId, isActive: true } });
    if (!patient) throw new BadRequestException('Patient not found');
    const open = await this.prisma.visit.findFirst({ where: { businessId, patientId: patient.id, status: { in: [...OPEN_STATUSES] } }, select: { visitNumber: true } });
    if (open) throw new ConflictException(`${patient.name} already has an open visit (${open.visitNumber})`);
    const data = {
      businessId, storeId, patientId: patient.id,
      complaint: optionalText(dto.complaint, 'Complaint', 500),
      priority: dto.priority ? oneOf(String(dto.priority).toUpperCase(), 'Priority', PRIORITIES) : 'NORMAL',
      appointmentId: optionalText(dto.appointmentId, 'Appointment', 64),
      createdBy: actor.name,
    };
    for (let attempt = 1; ; attempt++) {
      const visitNumber = await this.nextNumber(businessId);
      try {
        return await this.prisma.visit.create({ data: { ...data, visitNumber } });
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002' || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  /** The queue board: open visits (urgent first, longest wait next) and today's finished ones, each with who the patient is. */
  async board(businessId: string, storeId: string) {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const rows = await this.prisma.visit.findMany({
      where: { businessId, storeId, OR: [{ status: { in: [...OPEN_STATUSES] } }, { updatedAt: { gte: since } }] },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    const people = await this.patientCards(businessId, rows.map((r) => r.patientId));
    const withPatient = rows.map((r) => ({ ...this.present(r), patient: people.get(r.patientId) ?? null }));
    const open = queueOrder(withPatient.filter((r) => (OPEN_STATUSES as readonly string[]).includes(r.status)));
    const closed = withPatient.filter((r) => !(OPEN_STATUSES as readonly string[]).includes(r.status)).reverse();
    return { open, closed };
  }

  private async patientCards(businessId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const patients = unique.length ? await this.prisma.patient.findMany({ where: { businessId, id: { in: unique } } }) : [];
    return new Map(patients.map((p) => {
      const x = presentPatient(p);
      return [p.id, { id: p.id, name: p.name, patientNumber: p.patientNumber, phone: p.phone, sex: p.sex, ageYears: x.ageYears, allergies: x.allergies, conditions: x.conditions, pregnant: p.pregnant, weightKg: p.weightKg }] as const;
    }));
  }

  private present<T extends { diagnoses: string }>(v: T) {
    return { ...v, diagnoses: parseDiagnoses(v.diagnoses) };
  }

  /** The whole visit: the patient, what was found, the charges with their total, and the prescriptions written in it. */
  async get(id: string, businessId: string) {
    const v = await this.owned(id, businessId);
    const [patientRow, charges, prescriptions, invoicing] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: v.patientId, businessId } }),
      this.prisma.visitCharge.findMany({ where: { visitId: id, businessId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.prescription.findMany({ where: { visitId: id, businessId }, orderBy: { createdAt: 'asc' } }),
      this.directSales.isEnabled(businessId),
    ]);
    const totalCents = charges.reduce((sum, c) => sum + Math.round(c.unitPriceCents * c.quantity), 0);
    // `invoicing` tells the screen whether completing will take payment and give a fiscal receipt, or only close the visit.
    return { ...this.present(v), invoicing, patient: patientRow ? presentPatient(patientRow) : null, charges: charges.map((c) => ({ ...c, totalCents: Math.round(c.unitPriceCents * c.quantity) })), totalCents, prescriptions };
  }

  /** A patient's earlier visits, newest first: what they came for and what was found. */
  async history(patientId: string, businessId: string) {
    const rows = await this.prisma.visit.findMany({ where: { businessId, patientId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => this.present(r));
  }

  async saveVitals(id: string, businessId: string, dto: VitalsInput, actor: Actor) {
    const v = await this.owned(id, businessId);
    assertCan('vitals', v.status);
    const data = vitalsData(dto ?? {});
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to change');
    const firstTime = v.status === 'WAITING';
    if (hasAnyVital(data) || firstTime) Object.assign(data, { triagedAt: new Date(), triagedBy: actor.name });
    await this.move(id, businessId, ['WAITING', 'TRIAGED', 'IN_CONSULTATION'], { ...data, ...(firstTime ? { status: 'TRIAGED' } : {}) }, 'This visit has moved on. Reload it.');
    return this.get(id, businessId);
  }

  /** The doctor takes the patient in. A visit another doctor already holds is theirs until a manager moves it. */
  async start(id: string, businessId: string, actor: Actor) {
    VisitsService.needDoctor(actor);
    const v = await this.owned(id, businessId);
    assertCan('startConsultation', v.status);
    await this.move(id, businessId, ['WAITING', 'TRIAGED'], { status: 'IN_CONSULTATION', doctorId: actor.id, doctorName: actor.name, consultStartedAt: new Date() }, 'Another doctor just took this patient in. Reload it.');
    return this.get(id, businessId);
  }

  /** Only the doctor who has the patient (or a manager) writes the notes. */
  private assertOwnsConsultation(v: { doctorId: string | null; doctorName: string | null }, actor: Actor) {
    if (v.doctorId && v.doctorId !== actor.id && !MANAGER_ROLES.includes(actor.role)) {
      throw new ForbiddenException(`${v.doctorName ?? 'Another doctor'} has this patient. Only they or a manager can change the notes.`);
    }
  }

  async saveConsultation(id: string, businessId: string, dto: ConsultationInput, actor: Actor) {
    VisitsService.needDoctor(actor);
    const v = await this.owned(id, businessId);
    assertCan('consultation', v.status);
    this.assertOwnsConsultation(v, actor);
    await this.move(id, businessId, ['IN_CONSULTATION'], consultationData(dto ?? {}), 'This visit has moved on. Reload it.');
    return this.get(id, businessId);
  }

  /** The consultation is over: it needs at least one diagnosis, then the patient goes to billing. */
  async finish(id: string, businessId: string, actor: Actor) {
    VisitsService.needDoctor(actor);
    const v = await this.owned(id, businessId);
    assertCan('finishConsultation', v.status);
    this.assertOwnsConsultation(v, actor);
    if (parseDiagnoses(v.diagnoses).length === 0) throw new BadRequestException('Record at least one diagnosis before finishing the consultation');
    await this.move(id, businessId, ['IN_CONSULTATION'], { status: 'READY_TO_BILL', consultEndedAt: new Date() }, 'This visit has moved on. Reload it.');
    return this.get(id, businessId);
  }

  /** Back to the doctor, for something forgotten before the bill is taken. */
  async reopen(id: string, businessId: string, actor: Actor) {
    VisitsService.needDoctor(actor);
    const v = await this.owned(id, businessId);
    assertCan('reopen', v.status);
    this.assertOwnsConsultation(v, actor);
    await this.move(id, businessId, ['READY_TO_BILL'], { status: 'IN_CONSULTATION', consultEndedAt: null }, 'This visit has moved on. Reload it.');
    return this.get(id, businessId);
  }

  /** A fee on the visit: a service from the catalogue at its price (no stock moves, so only services). */
  async addCharge(id: string, businessId: string, dto: { itemId?: string; quantity?: number }, actor: Actor) {
    const v = await this.owned(id, businessId);
    assertCan('charge', v.status);
    const item = await this.prisma.item.findFirst({ where: { id: text(dto.itemId, 'Item', 64), businessId } });
    if (!item) throw new BadRequestException('That service is not in the catalogue');
    if (item.type !== 'SERVICE') throw new BadRequestException(`${item.name} is a product: medicines are billed when they are dispensed. Only services are charged on a visit.`);
    if (!(item.retailPriceCents > 0)) throw new BadRequestException(`${item.name} has no price. Set its price in Items & Stock first.`);
    const quantity = dto.quantity === undefined ? 1 : numberInRange(dto.quantity, 'Quantity', { min: 0, max: 1000, exclusiveMin: true });
    if (hasTooManyDecimals(quantity)) throw new BadRequestException('Quantity can have at most 3 decimal places');
    await this.prisma.visitCharge.create({ data: { businessId, visitId: id, itemId: item.id, name: item.name, quantity, unitPriceCents: item.retailPriceCents, addedBy: actor.name } });
    return this.get(id, businessId);
  }

  async removeCharge(id: string, chargeId: string, businessId: string) {
    const v = await this.owned(id, businessId);
    assertCan('charge', v.status);
    const gone = await this.prisma.visitCharge.deleteMany({ where: { id: chargeId, visitId: id, businessId } });
    if (gone.count !== 1) throw new NotFoundException('Charge not found');
    return this.get(id, businessId);
  }

  /**
   * Take the money and close the visit. For a business on the sales pipeline the charges become one invoice (with a KRA
   * receipt) in the same transaction as closing the visit; otherwise, or when there is nothing to charge, the visit just closes.
   */
  async complete(id: string, businessId: string, actor: Actor, dto: { payments?: Array<{ method: string; amountCents: number; reference?: string }>; buyerKraPin?: string } = {}) {
    const v = await this.owned(id, businessId);
    assertCan('complete', v.status);
    const charges = await this.prisma.visitCharge.findMany({ where: { visitId: id, businessId }, orderBy: { createdAt: 'asc' } });
    const invoice = (await this.directSales.isEnabled(businessId)) && charges.length > 0;

    let input: DirectSaleInput | null = null;
    if (invoice) {
      const payments = requireArray<{ method: string; amountCents: number; reference?: string }>(dto.payments ?? [], 'payments').map((p) => ({
        method: oneOf(String(p?.method ?? '').toUpperCase(), 'Payment method', PAYMENT_METHODS),
        amountCents: intInRange(p?.amountCents, 'Payment amount', 1, 1_000_000_000),
        ...(p?.reference ? { reference: text(p.reference, 'Payment reference', 80) } : {}),
      }));
      const items = await this.prisma.item.findMany({ where: { id: { in: [...new Set(charges.map((c) => c.itemId))] }, businessId } });
      const byId = new Map(items.map((i) => [i.id, i]));
      const patient = await this.prisma.patient.findFirst({ where: { id: v.patientId, businessId } });
      input = {
        businessId, storeId: v.storeId, cashierId: actor.id, source: 'CLINIC',
        lines: charges.map((c) => {
          const item = byId.get(c.itemId);
          if (!item) throw new BadRequestException(`${c.name} is no longer in the catalogue`);
          return { itemId: item.id, name: c.name, quantity: c.quantity, unitPriceCents: c.unitPriceCents, totalCents: Math.round(c.unitPriceCents * c.quantity), taxClass: taxClassOf(item) };
        }),
        payments,
        customerName: patient?.name,
        customerPhone: patient?.phone ?? undefined,
        buyerKraPin: optionalKraPin(dto.buyerKraPin, 'Buyer KRA PIN'),
        notes: `Visit ${v.visitNumber}`,
      };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.visit.updateMany({ where: { id, businessId, status: 'READY_TO_BILL' }, data: { status: 'COMPLETED', completedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException('This visit was just completed by someone else. Reload it.');
      if (!input) return null;
      const result = await this.directSales.createInTx(tx, input);
      await tx.visit.updateMany({ where: { id, businessId }, data: { saleId: result.sale.id } });
      return result;
    });

    if (!outcome || !input) return { visit: await this.get(id, businessId), invoice: null, etims: null };
    const after = this.directSales.afterCommit(outcome, input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    return { visit: await this.get(id, businessId), invoice: outcome.sale, etims, receiptNumber: outcome.sale.receiptNumber };
  }

  /** The patient left, or the visit was opened by mistake. Nothing is billed. */
  async cancel(id: string, businessId: string, reason: unknown) {
    const v = await this.owned(id, businessId);
    assertCan('cancel', v.status);
    const why = text(reason, 'Reason', 200);
    await this.move(id, businessId, ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'], { status: 'CANCELLED', cancelReason: why }, 'This visit has moved on. Reload it.');
    return this.get(id, businessId);
  }
}

