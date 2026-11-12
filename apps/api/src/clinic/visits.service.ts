import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { taxClassOf } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, numberInRange, oneOf, optionalKraPin, optionalText, requireArray, text } from '../common/validate';
import { hasTooManyDecimals } from '../common/quantity';
import { DirectSaleService, type DirectSaleInput, type EtimsOutcome } from '../sales/direct-sale.service';
import { presentPatient } from '../patients/patient-data';
import { cleanDiagnoses, parseDiagnoses } from './diagnosis-codes';
import { CoverService } from '../cover/cover.service';
import { NotificationsService } from '../notifications/notifications.service';
import { daysOverdue, followUpBucket, reminderMessage } from './follow-ups';
import { splitBill } from '../cover/cover';
import { applyTariff, loadTariff } from '../cover/tariff';
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
  constructor(private prisma: PrismaService, private directSales: DirectSaleService, private cover: CoverService, private notifications: NotificationsService) {}

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

  /**
   * A booked patient arrives: queue them as a visit tied to the appointment, bring the appointment's services onto the bill, and
   * move the appointment to IN_PROGRESS, all together. An appointment holding a deposit is not taken this way: the deposit is
   * applied when the appointment itself is completed, and a visit would bypass that. Finishing or cancelling the visit
   * closes the appointment (see `complete` and `cancel`).
   */
  async createFromAppointment(businessId: string, appointmentId: string, dto: { patientId?: string; complaint?: string }, actor: Actor) {
    const appt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, businessId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    if (!['BOOKED', 'CONFIRMED'].includes(appt.status)) throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot be checked in`);
    if (appt.depositCents > 0) throw new BadRequestException('This appointment holds a deposit. Complete it from Appointments so the deposit is applied, or refund the deposit first.');
    const patient = await this.prisma.patient.findFirst({ where: { id: text(dto.patientId, 'Patient', 64), businessId, isActive: true } });
    if (!patient) throw new BadRequestException('Patient not found');
    const already = await this.prisma.visit.findFirst({ where: { businessId, appointmentId, status: { not: 'CANCELLED' } }, select: { visitNumber: true } });
    if (already) throw new ConflictException(`This appointment is already checked in (${already.visitNumber})`);
    const open = await this.prisma.visit.findFirst({ where: { businessId, patientId: patient.id, status: { in: [...OPEN_STATUSES] } }, select: { visitNumber: true } });
    if (open) throw new ConflictException(`${patient.name} already has an open visit (${open.visitNumber})`);

    // The services booked, priced as they were booked; an older booking with only a service on the appointment itself counts as one.
    const booked = await this.prisma.appointmentService.findMany({ where: { appointmentId }, orderBy: { position: 'asc' } });
    const wanted = booked.length > 0 ? booked.filter((b) => b.itemId).map((b) => ({ itemId: b.itemId as string, name: b.name, unitPriceCents: b.unitPriceCents }))
      : appt.serviceItemId ? [{ itemId: appt.serviceItemId, name: '', unitPriceCents: 0 }] : [];
    const itemRows = wanted.length ? await this.prisma.item.findMany({ where: { businessId, id: { in: wanted.map((w) => w.itemId) } }, select: { id: true, name: true, type: true, retailPriceCents: true } }) : [];
    const byId = new Map(itemRows.map((i) => [i.id, i]));
    const charges = wanted.flatMap((w) => {
      const item = byId.get(w.itemId);
      if (!item || item.type !== 'SERVICE') return [];
      const price = w.unitPriceCents > 0 ? w.unitPriceCents : item.retailPriceCents;
      return price > 0 ? [{ businessId, itemId: item.id, name: w.name || item.name, quantity: 1, unitPriceCents: price, addedBy: actor.name }] : [];
    });
    const data = {
      businessId, storeId: appt.storeId, patientId: patient.id, appointmentId,
      complaint: optionalText(dto.complaint, 'Complaint', 500) ?? optionalText(appt.notes, 'Complaint', 500),
      priority: 'NORMAL', createdBy: actor.name,
    };
    for (let attempt = 1; ; attempt++) {
      const visitNumber = await this.nextNumber(businessId);
      try {
        const visitId = await this.prisma.$transaction(async (tx) => {
          const moved = await tx.appointment.updateMany({ where: { id: appointmentId, businessId, status: { in: ['BOOKED', 'CONFIRMED'] } }, data: { status: 'IN_PROGRESS' } });
          if (moved.count !== 1) throw new BadRequestException('This appointment was just changed by someone else. Reload it.');
          const visit = await tx.visit.create({ data: { ...data, visitNumber } });
          for (const c of charges) await tx.visitCharge.create({ data: { ...c, visitId: visit.id } });
          return visit.id;
        });
        return this.get(visitId, businessId);
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002' || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  /**
   * Patients whose follow-up is due: overdue by up to 60 days, today, or in the next 14 days, whom nobody has reached yet and who
   * have not already come back (a later visit means the follow-up happened).
   */
  async followUps(businessId: string, storeId?: string) {
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 86_400_000);
    const to = new Date(now.getTime() + 14 * 86_400_000);
    const rows = await this.prisma.visit.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}), followUpDate: { gte: from, lte: to }, followUpContactedAt: null, status: { in: ['READY_TO_BILL', 'COMPLETED'] } },
      orderBy: { followUpDate: 'asc' },
      take: 500,
    });
    if (rows.length === 0) return { overdue: [], today: [], soon: [] };
    const later = await this.prisma.visit.findMany({ where: { businessId, patientId: { in: [...new Set(rows.map((r) => r.patientId))] }, status: { not: 'CANCELLED' }, createdAt: { gt: rows.reduce((m, r) => (r.createdAt < m ? r.createdAt : m), rows[0].createdAt) } }, select: { patientId: true, createdAt: true } });
    const lastVisit = new Map<string, number>();
    for (const l of later) lastVisit.set(l.patientId, Math.max(lastVisit.get(l.patientId) ?? 0, l.createdAt.getTime()));
    const due = rows.filter((r) => (lastVisit.get(r.patientId) ?? 0) <= r.createdAt.getTime());
    const people = await this.patientCards(businessId, due.map((r) => r.patientId));
    const out: Record<'overdue' | 'today' | 'soon', unknown[]> = { overdue: [], today: [], soon: [] };
    for (const r of due) {
      out[followUpBucket(r.followUpDate as Date, now)].push({
        id: r.id, visitNumber: r.visitNumber, followUpDate: r.followUpDate, daysOverdue: daysOverdue(r.followUpDate as Date, now), complaint: r.complaint, diagnoses: parseDiagnoses(r.diagnoses),
        doctorName: r.doctorName, patient: people.get(r.patientId) ?? null,
      });
    }
    return out;
  }

  /** Someone reached the patient some other way (a call). The follow-up leaves the list. */
  async markFollowUpContacted(id: string, businessId: string, actor: Actor) {
    const v = await this.owned(id, businessId);
    if (!v.followUpDate) throw new BadRequestException('This visit has no follow-up date');
    const done = await this.prisma.visit.updateMany({ where: { id, businessId, followUpContactedAt: null }, data: { followUpContactedAt: new Date(), followUpContactedBy: actor.name } });
    if (done.count !== 1) throw new BadRequestException('Someone already reached this patient');
    return { ok: true };
  }

  /** SMS the patient a plain reminder. It is marked contacted only when the message actually went. */
  async remindFollowUp(id: string, businessId: string, actor: Actor) {
    const v = await this.owned(id, businessId);
    if (!v.followUpDate) throw new BadRequestException('This visit has no follow-up date');
    if (v.followUpContactedAt) throw new BadRequestException('Someone already reached this patient');
    const [patient, business] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: v.patientId, businessId }, select: { name: true, phone: true } }),
      this.prisma.business.findFirst({ where: { id: businessId }, select: { name: true } }),
    ]);
    if (!patient?.phone) throw new BadRequestException('This patient has no phone number on record');
    const sent = await this.notifications.sendSMS(businessId, patient.phone, reminderMessage(patient.name, business?.name ?? 'the clinic', v.followUpDate));
    if (!sent.success) throw new BadRequestException(sent.error === 'Messaging not configured' ? 'SMS is not set up for this business. Call the patient and mark them as reached instead.' : `The message was not sent: ${sent.error ?? 'unknown error'}`);
    await this.prisma.visit.updateMany({ where: { id, businessId, followUpContactedAt: null }, data: { followUpContactedAt: new Date(), followUpContactedBy: `${actor.name} (SMS)` } });
    return { ok: true };
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
  async complete(id: string, businessId: string, actor: Actor, dto: { payments?: Array<{ method: string; amountCents: number; reference?: string }>; buyerKraPin?: string; insurance?: { providerId?: string; memberNumber?: string; patientPct?: number } } = {}) {
    const v = await this.owned(id, businessId);
    assertCan('complete', v.status);
    const charges = await this.prisma.visitCharge.findMany({ where: { visitId: id, businessId }, orderBy: { createdAt: 'asc' } });
    const invoice = (await this.directSales.isEnabled(businessId)) && charges.length > 0;
    const insured = await this.insuredShare(v, businessId, charges, dto.insurance);

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
          // An insured visit is invoiced at the insurer's price where it has one (see insuredShare).
          const unit = insured?.pricedLines.find((p) => p.itemId === c.itemId && p.name === c.name)?.unitPriceCents ?? c.unitPriceCents;
          return { itemId: item.id, name: c.name, quantity: c.quantity, unitPriceCents: unit, totalCents: Math.round(unit * c.quantity), taxClass: taxClassOf(item) };
        }),
        // The insurer's share is owed to the clinic by the insurer until the claim is paid.
        payments: [...payments, ...(insured && insured.insurerCents > 0 ? [{ method: 'INSURANCE', amountCents: insured.insurerCents }] : [])],
        customerName: patient?.name,
        customerPhone: patient?.phone ?? undefined,
        buyerKraPin: optionalKraPin(dto.buyerKraPin, 'Buyer KRA PIN'),
        notes: `Visit ${v.visitNumber}`,
      };
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.visit.updateMany({ where: { id, businessId, status: 'READY_TO_BILL' }, data: { status: 'COMPLETED', completedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException('This visit was just completed by someone else. Reload it.');
      const result = input ? await this.directSales.createInTx(tx, input) : null;
      if (result) await tx.visit.updateMany({ where: { id, businessId }, data: { saleId: result.sale.id } });
      // The appointment this visit came from is done. Closed directly, not through the appointment's own completion, which would invoice it a second time.
      if (v.appointmentId) await tx.appointment.updateMany({ where: { id: v.appointmentId, businessId, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } });
      // The insurer's share becomes a claim, with the diagnoses it was raised for. Without real sales there is no sale behind it.
      const claim = insured && insured.insurerCents > 0
        ? await tx.insuranceClaim.create({
            data: {
              businessId, visitId: id, patientId: v.patientId, providerId: insured.providerId, patientInsuranceId: insured.memberNumber,
              billedCents: insured.insurerCents, copayPct: insured.patientPct, status: 'SUBMITTED', saleId: result?.sale.id ?? null,
              diagnoses: JSON.stringify(parseDiagnoses(v.diagnoses)), coverCheckId: insured.checkId,
            },
          })
        : null;
      return { result, claim };
    });

    if (!outcome.result || !input) return { visit: await this.get(id, businessId), invoice: null, etims: null, claimId: outcome.claim?.id ?? null };
    const after = this.directSales.afterCommit(outcome.result, input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    return { visit: await this.get(id, businessId), invoice: outcome.result.sale, etims, receiptNumber: outcome.result.sale.receiptNumber, claimId: outcome.claim?.id ?? null };
  }

  /**
   * Work out who pays what when an insurer covers part of the bill. SHA and other insurers that ask for it must have had their
   * cover confirmed for this visit first: an unconfirmed (or refused) member would otherwise leave the clinic with an unpayable claim.
   */
  private async insuredShare(
    v: { id: string; patientId: string; createdAt: Date },
    businessId: string,
    charges: Array<{ itemId: string; name: string; unitPriceCents: number; quantity: number }>,
    ins: { providerId?: string; memberNumber?: string; patientPct?: number } | undefined,
  ) {
    if (!ins || !ins.providerId) return null;
    if (charges.length === 0) throw new BadRequestException('There is nothing on the bill to claim');
    const provider = await this.prisma.insuranceProvider.findFirst({ where: { id: text(ins.providerId, 'Insurer', 64), businessId, isActive: true } });
    if (!provider) throw new BadRequestException('That insurer is not set up here');
    const patient = await this.prisma.patient.findFirst({ where: { id: v.patientId, businessId }, select: { insuranceMemberNumber: true } });
    const memberNumber = optionalText(ins.memberNumber, 'Member number', 60) ?? patient?.insuranceMemberNumber?.trim();
    if (!memberNumber) throw new BadRequestException('Enter the patient\'s member number for the insurer');
    // 100 would mean the insurer pays nothing, so there is no claim to make: take payment as a normal sale.
    const patientPct = intInRange(ins.patientPct ?? 0, 'Patient share (%)', 0, 99);
    const { standing, checkId } = await this.cover.standingFor(businessId, v, provider.id, memberNumber);
    if (provider.requiresEligibility && standing !== 'ELIGIBLE') {
      throw new BadRequestException(
        standing === 'NOT_ELIGIBLE'
          ? `${provider.name} reported this member as not eligible. Bill the patient directly, or correct the member number and check again.`
          : `Cover with ${provider.name} has not been confirmed for this visit. Record a cover check first.`,
      );
    }
    // The invoice is at the insurer's own prices for every service it has a price for, and at the list price for the rest.
    const tariff = await loadTariff(this.prisma, businessId, provider.id);
    const priced = applyTariff(charges.map((c) => ({ itemId: c.itemId, name: c.name, quantity: c.quantity, unitPriceCents: c.unitPriceCents })), tariff);
    return { providerId: provider.id, memberNumber, patientPct, checkId, pricedLines: priced.lines, ...splitBill(priced.billTotalCents, patientPct) };
  }

  /** The patient left, or the visit was opened by mistake. Nothing is billed. */
  async cancel(id: string, businessId: string, reason: unknown) {
    const v = await this.owned(id, businessId);
    assertCan('cancel', v.status);
    const why = text(reason, 'Reason', 200);
    await this.move(id, businessId, ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'], { status: 'CANCELLED', cancelReason: why }, 'This visit has moved on. Reload it.');
    // The patient left before being seen through: the appointment does not stay open holding the slot.
    if (v.appointmentId) await this.prisma.appointment.updateMany({ where: { id: v.appointmentId, businessId, status: 'IN_PROGRESS' }, data: { status: 'CANCELLED' } });
    return this.get(id, businessId);
  }
}

