import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { taxClassOf } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, oneOf, optionalKraPin, optionalText, requireArray, text } from '../common/validate';
import { nairobiDay, nairobiDayEnd, nairobiDayStart } from '../common/dates';
import { LedgerService } from '../ledger/ledger.service';
import { DirectSaleService, type DirectSaleInput, type DirectSaleResult, type EtimsOutcome } from '../sales/direct-sale.service';
import { postDepositJournal, postTipJournal } from '../sales/sale-ledger';
import { DEPOSIT_METHODS, knownDepositMethod, refundMethodFor } from '../sales/deposit-register';
import { ensureServiceItem } from '../sales/vertical-items';
import { drawStock } from '../batch/batch-allocation';
import { assertStockAvailable, blocksOversell } from '../sales/stock-guard';
import { commissionBase, commissionCents } from '../hr/commission-base';
import { parseWorkingHours, placeServices, totalMinutes, withinWorkingHours, type ServiceSlot, type WorkingHours } from './salon-schedule';

export const APPOINTMENT_STATUSES = ['BOOKED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
/** The moves the appointments screen offers. Anything else is refused. */
const NEXT: Record<string, readonly string[]> = {
  // A customer who does not turn up never started, so a no-show is possible before the appointment begins.
  BOOKED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
/** Statuses that still occupy a staff member's time. */
const HOLDING = ['BOOKED', 'CONFIRMED', 'IN_PROGRESS'];
const MIN_MS = 60_000;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
const MAX_CENTS = 1_000_000_000;
/** How a customer pays for a completed appointment. The deposit already held is applied by the system. */
const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;
/** How long completing an appointment waits for KRA so the receipt can carry the QR code. */
const ETIMS_WAIT_MS = 5000;
const DEPOSIT_REASON = 'APPOINTMENT_DEPOSIT';
const TIP_REASON = 'APPOINTMENT_TIP';
const MAX_SERVICES = 10;
type Actor = { id?: string; name?: string; role?: string };

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(private prisma: PrismaService, private directSales: DirectSaleService, private ledger: LedgerService) {}

  async findAll(businessId: string, storeId: string, date?: string, status?: string) {
    const where: Record<string, unknown> = { businessId, storeId };
    if (status && status !== 'ALL') where.status = status;
    if (date) {
      // A day is the Nairobi day. The old server-local setHours() drew it three hours off on a UTC host.
      const instant = DAY_ONLY.test(date) ? null : new Date(date);
      if (instant && Number.isNaN(instant.getTime())) throw new BadRequestException('date is not a valid date');
      const day = instant ? nairobiDay(instant) : date;
      where.scheduledAt = { gte: nairobiDayStart(day), lte: nairobiDayEnd(day) };
    }
    const list = await this.prisma.appointment.findMany({ where, orderBy: { scheduledAt: 'asc' } });
    return this.withServices(list);
  }

  async findOne(id: string, businessId: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, businessId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  /** Each appointment with its services (an older one-service appointment has none stored and reads as an empty list). */
  private async withServices<T extends { id: string }>(list: T[]): Promise<Array<T & { services: Array<Record<string, unknown>> }>> {
    if (list.length === 0) return [];
    const rows = await this.prisma.appointmentService.findMany({ where: { appointmentId: { in: list.map((a) => a.id) } }, orderBy: { position: 'asc' } });
    return list.map((a) => ({ ...a, services: rows.filter((r) => r.appointmentId === a.id) }));
  }

  private when(value: unknown): Date {
    const d = new Date(String(value ?? ''));
    if (Number.isNaN(d.getTime())) throw new BadRequestException('scheduledAt is not a valid date and time');
    return d;
  }

  /**
   * Throws if the staff member already has a held appointment overlapping [start, start + duration). A visit with several
   * services holds each service's staff member only for that service's part of it.
   */
  private async assertStaffFree(
    tx: Pick<PrismaService, 'appointment' | 'appointmentService' | '$executeRaw'>,
    businessId: string,
    staffId: string,
    start: Date,
    durationMin: number,
    ignoreId?: string,
  ) {
    // One staff member's calendar is edited one request at a time, so two desks cannot both take the same slot.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessId + ':' + staffId}))`;
    const end = new Date(start.getTime() + durationMin * MIN_MS);
    const near = await tx.appointment.findMany({
      where: {
        businessId,
        status: { in: HOLDING },
        ...(ignoreId && { id: { not: ignoreId } }),
        scheduledAt: { gte: new Date(start.getTime() - 12 * 60 * MIN_MS), lt: end },
      },
    });
    if (near.length === 0) return;
    const rows = await tx.appointmentService.findMany({ where: { appointmentId: { in: near.map((a) => a.id) } }, orderBy: { position: 'asc' } });
    for (const a of near) {
      const mine = rows.filter((r) => r.appointmentId === a.id);
      // Older appointments (and ones without a stored service) are one slot held by the appointment's own staff member.
      const slots: Array<{ staffId?: string | null; start: Date; end: Date }> = mine.length
        ? placeServices(a.scheduledAt, mine.map((r) => ({ itemId: r.itemId, name: r.name, unitPriceCents: r.unitPriceCents, durationMin: r.durationMin, staffId: r.staffId })))
        : [{ staffId: a.staffId, start: a.scheduledAt, end: new Date(a.scheduledAt.getTime() + a.duration * MIN_MS) }];
      const clash = slots.find((sl) => sl.staffId === staffId && sl.end > start && sl.start < end);
      if (clash) {
        const at = clash.start.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
        throw new ConflictException(`That staff member is already booked at ${at} for ${a.customerName}.`);
      }
    }
  }

  /** The staff member must be in this business, taking appointments, and working at that time (when their hours are set). */
  private async assertStaffAvailable(
    tx: Pick<PrismaService, 'user' | 'serviceStaff'>,
    businessId: string,
    staffId: string,
    start: Date,
    end: Date,
  ) {
    const user = await tx.user.findFirst({ where: { id: staffId, businessId }, select: { id: true, name: true } });
    if (!user) throw new BadRequestException('That staff member was not found');
    // findFirst, not findUnique by the compound key: the tenant layer turns findUnique into a findFirst that does not know the key.
    const row = await tx.serviceStaff.findFirst({ where: { businessId, userId: staffId } });
    if (!row) return;
    if (!row.active) throw new BadRequestException(`${user.name} is not taking appointments`);
    let hours: WorkingHours = {};
    try { hours = parseWorkingHours(row.workingHours); } catch { /* damaged stored hours: no restriction rather than no bookings */ }
    if (!withinWorkingHours(hours, start, end)) throw new BadRequestException(`${user.name} is not working at that time`);
  }

  /** Check every placed service that names a staff member: available, and free. */
  private async assertSlots(
    tx: Pick<PrismaService, 'appointment' | 'appointmentService' | 'user' | 'serviceStaff' | '$executeRaw'>,
    businessId: string,
    placed: Array<{ staffId?: string | null; start: Date; end: Date }>,
    ignoreId?: string,
  ) {
    for (const p of placed) {
      if (!p.staffId) continue;
      await this.assertStaffAvailable(tx, businessId, p.staffId, p.start, p.end);
      await this.assertStaffFree(tx, businessId, p.staffId, p.start, Math.round((p.end.getTime() - p.start.getTime()) / MIN_MS), ignoreId);
    }
  }

  /**
   * The services of a booking, from the catalogue. A service with a catalogue item takes its name and price from it, and its
   * duration from the item's own (set on the service) unless the desk gave one. Duration of a service with neither is 30 minutes.
   */
  private async resolveServices(businessId: string, input: unknown): Promise<ServiceSlot[]> {
    const list = requireArray<Record<string, unknown>>(input, 'services');
    if (list.length === 0) return [];
    if (list.length > MAX_SERVICES) throw new BadRequestException(`An appointment can have at most ${MAX_SERVICES} services`);
    const ids = [...new Set(list.map((l) => (typeof l?.itemId === 'string' ? l.itemId : '')).filter(Boolean))];
    const items = ids.length === 0 ? [] : await this.prisma.item.findMany({ where: { id: { in: ids }, businessId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return list.map((raw) => {
      const itemId = typeof raw?.itemId === 'string' && raw.itemId ? raw.itemId : null;
      const item = itemId ? byId.get(itemId) : undefined;
      if (itemId && !item) throw new BadRequestException('Service not found');
      return {
        itemId,
        name: item?.name ?? text(raw?.name ?? 'Service', 'Service name', 120),
        unitPriceCents: item ? item.retailPriceCents : intInRange(raw?.unitPriceCents ?? 0, 'Service price', 0, MAX_CENTS),
        durationMin: raw?.durationMin !== undefined && raw?.durationMin !== null && String(raw.durationMin) !== ''
          ? intInRange(raw.durationMin, 'Duration (minutes)', 5, 720)
          : item?.durationMinutes ?? 30,
        staffId: optionalText(raw?.staffId, 'Staff', 64) ?? null,
      };
    });
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    serviceItemId?: string;
    staffId?: string;
    /** Several services, in the order they are done, each with its own stylist. Takes the place of serviceItemId/staffId/duration. */
    services?: Array<{ itemId?: string; name?: string; unitPriceCents?: number; durationMin?: number; staffId?: string }>;
    scheduledAt: string;
    duration?: number;
    notes?: string;
    depositCents?: number;
    depositMethod?: string;
  }, actor: Actor = {}) {
    if (typeof dto.storeId !== 'string' || !dto.storeId) throw new BadRequestException('storeId is required');
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId: dto.businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');

    const scheduledAt = this.when(dto.scheduledAt);
    if (scheduledAt < nairobiDayStart(nairobiDay(new Date()))) throw new BadRequestException('An appointment cannot be booked in the past');
    const depositCents = intInRange(dto.depositCents ?? 0, 'Deposit', 0, 1_000_000_000);

    if (dto.customerId) {
      const c = await this.prisma.customer.count({ where: { id: dto.customerId, businessId: dto.businessId } });
      if (!c) throw new BadRequestException('Customer not found');
    }

    // Several services (the salon's way), or the older single service / staff / duration on the appointment itself.
    const multi = dto.services !== undefined;
    const slots = multi ? await this.resolveServices(dto.businessId, dto.services) : [];
    if (!multi && dto.serviceItemId) {
      const i = await this.prisma.item.count({ where: { id: dto.serviceItemId, businessId: dto.businessId } });
      if (!i) throw new BadRequestException('Service not found');
    }
    const legacyStaff = multi ? null : (optionalText(dto.staffId, 'Staff', 64) ?? null);
    const duration = multi && slots.length > 0 ? totalMinutes(slots) : intInRange(dto.duration ?? 60, 'Duration (minutes)', 5, 720);
    const placed = multi && slots.length > 0
      ? placeServices(scheduledAt, slots)
      : [{ staffId: legacyStaff, start: scheduledAt, end: new Date(scheduledAt.getTime() + duration * MIN_MS) }];
    const staffId = multi ? (slots[0]?.staffId ?? null) : legacyStaff;
    const serviceItemId = multi ? (slots[0]?.itemId ?? null) : (dto.serviceItemId ?? null);

    // On the sales pipeline a deposit is money taken: it needs a method, and goes in the deposit register.
    const register = depositCents > 0 && (await this.directSales.isEnabled(dto.businessId));
    const depositMethod = register ? oneOf(String(dto.depositMethod ?? '').toUpperCase(), 'Deposit method', DEPOSIT_METHODS) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      await this.assertSlots(tx, dto.businessId, placed);
      const appt = await tx.appointment.create({
        data: {
          businessId: dto.businessId,
          storeId: dto.storeId,
          customerId: dto.customerId,
          customerName: text(dto.customerName, 'Customer name', 120),
          customerPhone: optionalText(dto.customerPhone, 'Customer phone', 30),
          serviceItemId: serviceItemId ?? undefined,
          staffId: staffId ?? undefined,
          scheduledAt,
          duration,
          notes: optionalText(dto.notes, 'Notes', 500),
          depositCents,
        },
      });
      if (multi && slots.length > 0) {
        await tx.appointmentService.createMany({
          data: slots.map((sl, position) => ({
            appointmentId: appt.id, itemId: sl.itemId ?? null, name: sl.name, unitPriceCents: sl.unitPriceCents,
            durationMin: sl.durationMin, staffId: sl.staffId ?? null, position,
          })),
        });
      }
      const movement = depositMethod
        ? await tx.cashMovement.create({
            data: { businessId: dto.businessId, storeId: dto.storeId, cashierId: actor.id, kind: 'PAY_IN', method: depositMethod, amountCents: depositCents, reason: DEPOSIT_REASON, bookingId: appt.id },
          })
        : null;
      return { appt, movement };
    });
    if (created.movement && depositMethod) {
      this.postDepositLedger('RECEIVED', { id: created.movement.id, businessId: dto.businessId, storeId: dto.storeId, method: depositMethod, amountCents: depositCents, who: created.appt.customerName });
    }
    return { ...created.appt, services: multi ? slots.map((sl, position) => ({ ...sl, position })) : [] };
  }

  /** Take (a further) deposit on an appointment that has not happened yet. On the pipeline it goes in the register and the books. */
  async addDeposit(id: string, dto: { amountCents: number; method?: string }, businessId: string, actor: Actor = {}) {
    const appt = await this.findOne(id, businessId);
    if (!HOLDING.includes(appt.status)) throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot take a deposit`);
    const amountCents = intInRange(dto.amountCents, 'Deposit', 1, MAX_CENTS);
    const register = await this.directSales.isEnabled(businessId);
    const method = register ? oneOf(String(dto.method ?? '').toUpperCase(), 'Deposit method', DEPOSIT_METHODS) : null;

    const movement = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.appointment.updateMany({
        where: { id, businessId, status: { in: HOLDING } },
        data: { depositCents: { increment: amountCents } },
      });
      if (claimed.count !== 1) throw new BadRequestException('This appointment was just changed by someone else. Reload it.');
      return method
        ? tx.cashMovement.create({
            data: { businessId, storeId: appt.storeId, cashierId: actor.id, kind: 'PAY_IN', method, amountCents, reason: DEPOSIT_REASON, bookingId: id },
          })
        : null;
    });
    if (movement && method) this.postDepositLedger('RECEIVED', { id: movement.id, businessId, storeId: appt.storeId, method, amountCents, who: appt.customerName });
    return this.findOne(id, businessId);
  }

  private postDepositLedger(
    move: 'RECEIVED' | 'REFUNDED' | 'FORFEITED',
    m: { id: string; businessId: string; storeId: string; method: string; amountCents: number; who: string },
  ) {
    const label = { RECEIVED: 'Appointment deposit received', REFUNDED: 'Appointment deposit refunded', FORFEITED: 'Appointment deposit kept' }[move];
    void postDepositJournal(this.ledger, {
      businessId: m.businessId,
      storeId: m.storeId,
      description: `${label}: ${m.who}`,
      reference: `DEP-${m.id}`,
      move,
      method: m.method,
      amountCents: m.amountCents,
      sourceType: 'APPOINTMENT_DEPOSIT',
    }).catch((e: unknown) => this.logger.warn(`Ledger posting for deposit ${m.id} failed: ${String(e)}`));
  }

  async update(
    id: string,
    businessId: string,
    dto: Partial<{
      customerName: string; customerPhone: string; serviceItemId: string; staffId: string;
      /** Replace the services of a visit that has not happened yet. */
      services: Array<{ itemId?: string; name?: string; unitPriceCents?: number; durationMin?: number; staffId?: string }>;
      scheduledAt: string; duration: number; status: string; notes: string; depositCents: number;
      /** Completing, on the sales pipeline: what the customer pays now, a manager's price, a company PIN. */
      payments: Array<{ method: string; amountCents: number }>; amountCents: number; buyerKraPin: string;
      /** Completing: the lines of the bill (services, and retail products added at the end) in place of the booked services, and a tip. */
      lines: Array<{ itemId?: string; name?: string; quantity?: number; unitPriceCents?: number; staffId?: string }>;
      tipCents: number; tipMethod: string;
      /** Cancelling or a no-show with a deposit: how it is paid back (when the way it came in is not on record), or kept (manager). */
      refundMethod: string; keepDeposit: boolean;
    }>,
    actor: Actor = {},
  ) {
    const appt = await this.findOne(id, businessId);
    const invoice = await this.directSales.isEnabled(businessId);
    if (invoice && dto.depositCents !== undefined && dto.depositCents !== appt.depositCents) {
      throw new BadRequestException('Deposits are recorded as money taken: use Take a deposit, rather than editing the amount');
    }

    let status: string | undefined;
    if (dto.status !== undefined && dto.status !== appt.status) {
      status = oneOf(dto.status, 'Status', APPOINTMENT_STATUSES);
      if (!(NEXT[appt.status] ?? []).includes(status)) {
        throw new BadRequestException(`An appointment that is ${appt.status.toLowerCase().replace(/_/g, ' ')} cannot become ${status.toLowerCase().replace(/_/g, ' ')}`);
      }
    }
    if (invoice && status === 'COMPLETED') return this.complete(appt, dto, businessId, actor);
    if (invoice && (status === 'CANCELLED' || status === 'NO_SHOW') && appt.depositCents > 0) return this.closeWithDeposit(appt, status, dto, businessId, actor);

    const replacing = dto.services !== undefined;
    const reschedules = replacing || dto.scheduledAt !== undefined || dto.duration !== undefined || dto.staffId !== undefined;
    if (reschedules && !HOLDING.includes(appt.status)) {
      throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot be rescheduled`);
    }

    const scheduledAt = dto.scheduledAt !== undefined ? this.when(dto.scheduledAt) : appt.scheduledAt;
    const rows = await this.prisma.appointmentService.findMany({ where: { appointmentId: id }, orderBy: { position: 'asc' } });

    // The services as they will be: replaced, or the stored ones (with a single one taking a new stylist or duration), or none
    // at all for an older appointment, which is one slot held by the appointment's own staff member.
    let slots: ServiceSlot[] | null = null;
    if (replacing) {
      slots = await this.resolveServices(businessId, dto.services);
    } else if (rows.length > 0) {
      slots = rows.map((r) => ({ itemId: r.itemId, name: r.name, unitPriceCents: r.unitPriceCents, durationMin: r.durationMin, staffId: r.staffId }));
      if ((dto.duration !== undefined || dto.staffId !== undefined) && rows.length > 1) {
        throw new BadRequestException('This visit has several services: change the stylist or the time on each service');
      }
      if (rows.length === 1 && dto.staffId !== undefined) slots[0].staffId = optionalText(dto.staffId, 'Staff', 64) ?? null;
      if (rows.length === 1 && dto.duration !== undefined) slots[0].durationMin = intInRange(dto.duration, 'Duration (minutes)', 5, 720);
    }
    const duration = slots && slots.length > 0
      ? totalMinutes(slots)
      : dto.duration !== undefined ? intInRange(dto.duration, 'Duration (minutes)', 5, 720) : appt.duration;
    const staffId = slots && slots.length > 0
      ? (slots[0].staffId ?? null)
      : dto.staffId !== undefined ? (optionalText(dto.staffId, 'Staff', 64) ?? null) : appt.staffId;

    return this.prisma.$transaction(async (tx) => {
      // Moving into (or staying in) a held state with a staff member: every service's slot must be free.
      const finalStatus = status ?? appt.status;
      if (reschedules && HOLDING.includes(finalStatus)) {
        const placed = slots && slots.length > 0
          ? placeServices(scheduledAt, slots)
          : staffId ? [{ staffId, start: scheduledAt, end: new Date(scheduledAt.getTime() + duration * MIN_MS) }] : [];
        await this.assertSlots(tx, businessId, placed, id);
      }
      if (reschedules && slots) {
        await tx.appointmentService.deleteMany({ where: { appointmentId: id } });
        if (slots.length > 0) {
          await tx.appointmentService.createMany({
            data: slots.map((sl, position) => ({
              appointmentId: id, itemId: sl.itemId ?? null, name: sl.name, unitPriceCents: sl.unitPriceCents,
              durationMin: sl.durationMin, staffId: sl.staffId ?? null, position,
            })),
          });
        }
      }
      return tx.appointment.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(dto.scheduledAt !== undefined && { scheduledAt }),
          ...((dto.duration !== undefined || replacing) && { duration }),
          ...((dto.staffId !== undefined || replacing) && { staffId }),
          ...(replacing && { serviceItemId: slots?.[0]?.itemId ?? null }),
          ...(dto.customerName !== undefined && { customerName: text(dto.customerName, 'Customer name', 120) }),
          ...(dto.customerPhone !== undefined && { customerPhone: optionalText(dto.customerPhone, 'Customer phone', 30) ?? null }),
          ...(dto.serviceItemId !== undefined && !replacing && { serviceItemId: dto.serviceItemId || null }),
          ...(dto.notes !== undefined && { notes: optionalText(dto.notes, 'Notes', 500) ?? null }),
          ...(dto.depositCents !== undefined && { depositCents: intInRange(dto.depositCents, 'Deposit', 0, 1_000_000_000) }),
        },
      });
    });
  }

  /**
   * The lines of a bill the desk typed or edited at completion: catalogue items only (the item gives the tax class), each with
   * a quantity, optionally a price and the staff member who did it. Stock items are products added to the visit.
   */
  private async resolveBillLines(businessId: string, raw: unknown) {
    const list = requireArray<Record<string, unknown>>(raw, 'lines');
    if (list.length > 30) throw new BadRequestException('A bill can have at most 30 lines');
    const ids = [...new Set(list.map((l) => (typeof l?.itemId === 'string' ? l.itemId : '')).filter(Boolean))];
    const items = ids.length === 0 ? [] : await this.prisma.item.findMany({ where: { id: { in: ids }, businessId } });
    const byId = new Map(items.map((i) => [i.id, i]));
    return list.map((l) => {
      const item = typeof l?.itemId === 'string' ? byId.get(l.itemId) : undefined;
      if (!item) throw new BadRequestException('Every line on the bill must be an item from the catalogue');
      const quantity = intInRange(l?.quantity ?? 1, `Quantity of ${item.name}`, 1, 999);
      const unitPriceCents = l?.unitPriceCents !== undefined && l?.unitPriceCents !== null && String(l.unitPriceCents) !== ''
        ? intInRange(l.unitPriceCents, `Price of ${item.name}`, 0, MAX_CENTS)
        : item.retailPriceCents;
      return { item, itemId: item.id, name: item.name, quantity, unitPriceCents, staffId: optionalText(l?.staffId, 'Staff', 64) ?? null, booked: undefined as number | undefined };
    });
  }

  /**
   * Complete an appointment on the sales pipeline: it becomes ONE real sale, in the same transaction as the status
   * change. The bill is the visit's services (each at its booked price, each credited to the stylist who did it), or the
   * lines the desk edited at the end (a service added, a retail product, a different stylist). A price different from the
   * catalogue's is a manager's call. The deposit already held pays for it, up to the bill; what is left is paid now, and a
   * deposit larger than the bill is paid back. A tip is taken separately, in its own cash and ledger entry, so the tax
   * invoice carries exactly what was supplied.
   */
  private async complete(
    appt: { id: string; storeId: string; status: string; customerId?: string | null; staffId?: string | null; customerName: string; customerPhone: string | null; serviceItemId: string | null; depositCents: number; scheduledAt: Date },
    dto: {
      payments?: Array<{ method: string; amountCents: number }>; amountCents?: number; buyerKraPin?: string; refundMethod?: string;
      lines?: Array<{ itemId?: string; quantity?: number; unitPriceCents?: number; staffId?: string }>; tipCents?: number; tipMethod?: string;
    },
    businessId: string,
    actor: Actor,
  ) {
    const tenders = requireArray<{ method: string; amountCents: number }>(dto.payments ?? [], 'payments').map((p) => ({
      method: oneOf(String(p?.method ?? '').toUpperCase(), 'Payment method', PAYMENT_METHODS),
      amountCents: intInRange(p?.amountCents, 'Payment amount', 1, MAX_CENTS),
    }));
    const buyerKraPin = optionalKraPin(dto.buyerKraPin, 'Buyer KRA PIN');
    const isManager = MANAGER_ROLES.includes(String(actor.role));

    type BillLine = { item: any | null; itemId: string | null; name: string; quantity: number; unitPriceCents: number; staffId: string | null; booked?: number };
    let bill: BillLine[];
    const rows = await this.prisma.appointmentService.findMany({ where: { appointmentId: appt.id }, orderBy: { position: 'asc' } });
    if (Array.isArray(dto.lines) && dto.lines.length > 0) {
      bill = await this.resolveBillLines(businessId, dto.lines);
    } else if (rows.length > 0) {
      const ids = [...new Set(rows.map((r) => r.itemId).filter((id): id is string => !!id))];
      const found = ids.length === 0 ? [] : await this.prisma.item.findMany({ where: { id: { in: ids }, businessId } });
      const byId = new Map(found.map((i) => [i.id, i]));
      bill = rows.map((r) => ({ item: r.itemId ? byId.get(r.itemId) ?? null : null, itemId: r.itemId, name: r.name, quantity: 1, unitPriceCents: r.unitPriceCents, staffId: r.staffId, booked: r.unitPriceCents }));
    } else {
      // An appointment with one service chosen on the appointment itself, as before.
      const item = appt.serviceItemId ? await this.prisma.item.findFirst({ where: { id: appt.serviceItemId, businessId } }) : null;
      const listPrice = item?.retailPriceCents ?? 0;
      let priceCents = listPrice;
      if (dto.amountCents !== undefined && dto.amountCents !== null && String(dto.amountCents) !== '') {
        const asked = intInRange(dto.amountCents, 'Price', 1, MAX_CENTS);
        // Changing a listed price is a manager's call; with no list price there is nothing to change.
        if (listPrice > 0 && asked !== listPrice && !isManager) throw new ForbiddenException("Only a manager can change a service's price");
        priceCents = asked;
      }
      if (!(priceCents > 0)) throw new BadRequestException('This appointment has no priced service. Choose the service in the catalogue, or enter the price');
      bill = [{ item, itemId: item?.id ?? null, name: item?.name ?? 'Appointment service', quantity: 1, unitPriceCents: priceCents, staffId: appt.staffId ?? null, booked: listPrice > 0 ? undefined : priceCents }];
    }

    // A price that is not the catalogue's (and not the one booked) is a manager's call.
    for (const l of bill) {
      const catalogue = l.item?.retailPriceCents ?? 0;
      if (catalogue > 0 && l.unitPriceCents !== catalogue && l.unitPriceCents !== l.booked && !isManager) {
        throw new ForbiddenException("Only a manager can change a service's price");
      }
    }
    const staffIds = [...new Set(bill.map((l) => l.staffId).filter((id): id is string => !!id))];
    if (staffIds.length > 0) {
      const known = await this.prisma.user.findMany({ where: { id: { in: staffIds }, businessId }, select: { id: true } });
      if (known.length !== staffIds.length) throw new BadRequestException('A staff member on the bill was not found');
    }

    const lines = bill.map((l) => ({ ...l, totalCents: Math.round(l.unitPriceCents * l.quantity) }));
    const priceCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
    if (!(priceCents > 0)) throw new BadRequestException('This appointment has no priced service. Choose the service in the catalogue, or enter the price');
    const tipCents = intInRange(dto.tipCents ?? 0, 'Tip', 0, MAX_CENTS);
    const tipMethod = tipCents > 0 ? oneOf(String(dto.tipMethod ?? 'CASH').toUpperCase(), 'Tip method', PAYMENT_METHODS) : null;

    const applied = Math.min(appt.depositCents, priceCents);
    const due = priceCents - applied;
    const tendered = tenders.reduce((sum, t) => sum + t.amountCents, 0);
    if (tendered < due) {
      throw new BadRequestException(`The balance is KES ${(due / 100).toFixed(2)} but only KES ${(tendered / 100).toFixed(2)} was received. Take the full payment to complete it.`);
    }
    const surplus = appt.depositCents - applied;

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Claim the completion, so two desks (or a double click) cannot both bill it.
      const claimed = await tx.appointment.updateMany({ where: { id: appt.id, businessId, status: appt.status }, data: { status: 'COMPLETED' } });
      if (claimed.count !== 1) throw new BadRequestException('This appointment was just changed by someone else. Reload it.');

      const fallbackItem = lines.some((l) => !l.item) ? await ensureServiceItem(tx, { businessId, storeId: appt.storeId, category: 'Appointments', name: 'Appointment service' }) : null;
      // Products sold with the visit take stock off the shelf; a business that blocks overselling is held to it.
      const stocked = lines.filter((l) => l.item?.trackStock);
      if (stocked.length > 0) {
        const biz = await tx.business.findUnique({ where: { id: businessId }, select: { negativePolicyDefault: true } });
        const blocked = stocked.filter((l) => blocksOversell(l.item, biz?.negativePolicyDefault)).map((l) => ({ itemId: l.item.id, name: l.item.name, quantity: l.quantity }));
        if (blocked.length > 0) await assertStockAvailable(tx, { businessId, storeId: appt.storeId, lines: blocked });
      }
      const input: DirectSaleInput = {
        businessId,
        storeId: appt.storeId,
        cashierId: actor.id,
        source: 'APPOINTMENT',
        lines: lines.map((l) => {
          const item = l.item ?? fallbackItem;
          return { itemId: item?.id, name: l.name, quantity: l.quantity, unitPriceCents: l.unitPriceCents, totalCents: l.totalCents, taxClass: taxClassOf(item), ...(l.staffId && { staffId: l.staffId }) };
        }),
        payments: [...(applied > 0 ? [{ method: 'DEPOSIT', amountCents: applied }] : []), ...tenders],
        customerId: appt.customerId ?? undefined,
        customerName: appt.customerName,
        customerPhone: appt.customerPhone ?? undefined,
        buyerKraPin,
        notes: `Appointment ${nairobiDay(appt.scheduledAt)}`,
      };
      const result = await this.directSales.createInTx(tx, input);
      for (const l of stocked) {
        await drawStock(tx, {
          businessId, storeId: appt.storeId, itemId: l.item.id, itemName: l.item.name, quantity: l.quantity,
          saleId: result.sale.id, trackBatches: !!l.item.trackBatches,
        });
      }
      // updateMany, not update: the tenant middleware checks an `update` by id against rows outside this transaction.
      await tx.appointment.updateMany({ where: { id: appt.id, businessId }, data: { saleId: result.sale.id } });

      let refund: { id: string; method: string; amountCents: number } | null = null;
      if (surplus > 0) {
        const method = await refundMethodFor(tx, appt.id, businessId, DEPOSIT_REASON, dto.refundMethod);
        const movement = await tx.cashMovement.create({
          data: { businessId, storeId: appt.storeId, cashierId: actor.id, kind: 'PAY_OUT', method, amountCents: surplus, reason: `${DEPOSIT_REASON}_REFUND`, bookingId: appt.id, reference: result.sale.receiptNumber ?? undefined },
        });
        refund = { id: movement.id, method, amountCents: surplus };
      }
      let tip: { id: string; method: string; amountCents: number } | null = null;
      if (tipCents > 0 && tipMethod) {
        const movement = await tx.cashMovement.create({
          data: { businessId, storeId: appt.storeId, cashierId: actor.id, kind: 'PAY_IN', method: tipMethod, amountCents: tipCents, reason: TIP_REASON, bookingId: appt.id, reference: result.sale.receiptNumber ?? undefined },
        });
        tip = { id: movement.id, method: tipMethod, amountCents: tipCents };
      }
      return { direct: { result, input } as { result: DirectSaleResult; input: DirectSaleInput }, refund, tip };
    });

    // Books, KRA and the broadcast follow the commit, and cannot undo it. Wait briefly for KRA so the receipt can carry
    // the QR code; if it is slow the appointment is already billed and the receipt prints without it.
    const after = this.directSales.afterCommit(outcome.direct.result, outcome.direct.input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    if (outcome.refund) this.postDepositLedger('REFUNDED', { ...outcome.refund, businessId, storeId: appt.storeId, who: appt.customerName });
    if (outcome.tip) {
      void postTipJournal(this.ledger, {
        businessId, storeId: appt.storeId, description: `Tip: ${appt.customerName}`, reference: `TIP-${outcome.tip.id}`,
        method: outcome.tip.method, amountCents: outcome.tip.amountCents, sourceType: 'APPOINTMENT_TIP',
      }).catch((e: unknown) => this.logger.warn(`Ledger posting for tip ${outcome.tip?.id} failed: ${String(e)}`));
    }

    const sale = outcome.direct.result.sale;
    return {
      ...(await this.findOne(appt.id, businessId)),
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      invoice: sale,
      etims,
      changeDueCents: Math.max(0, tendered - due),
      refundDueCents: surplus,
      tipCents,
      ...(outcome.refund && { refundMethod: outcome.refund.method }),
    };
  }

  /**
   * Cancelling, or a no-show, when a deposit is held: it is paid back (the way it came in; the desk says how for one taken
   * before deposits were recorded) or, by a manager, kept as the business's income. Both are recorded, so the drawer and the books agree.
   */
  private async closeWithDeposit(
    appt: { id: string; storeId: string; status: string; customerName: string; depositCents: number },
    status: string,
    dto: { refundMethod?: string; keepDeposit?: boolean },
    businessId: string,
    actor: Actor,
  ) {
    const keep = dto.keepDeposit === true;
    if (keep && !MANAGER_ROLES.includes(String(actor.role))) throw new ForbiddenException("Only a manager can keep a customer's deposit");
    const outcome = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.appointment.updateMany({ where: { id: appt.id, businessId, status: appt.status }, data: { status } });
      if (claimed.count !== 1) throw new BadRequestException('This appointment was just changed by someone else. Reload it.');
      // Keeping a deposit moves no money, so how it came in does not matter then; paying it back does.
      const method = keep
        ? (await knownDepositMethod(tx, appt.id, businessId, DEPOSIT_REASON)) ?? 'OPENING'
        : await refundMethodFor(tx, appt.id, businessId, DEPOSIT_REASON, dto.refundMethod);
      const row = await tx.cashMovement.create({
        data: {
          businessId, storeId: appt.storeId, cashierId: actor.id, kind: keep ? 'FORFEIT' : 'PAY_OUT', method, amountCents: appt.depositCents,
          reason: keep ? `${DEPOSIT_REASON}_FORFEIT` : `${DEPOSIT_REASON}_REFUND`, bookingId: appt.id,
        },
      });
      return { id: row.id, method };
    });
    this.postDepositLedger(keep ? 'FORFEITED' : 'REFUNDED', { id: outcome.id, businessId, storeId: appt.storeId, method: outcome.method, amountCents: appt.depositCents, who: appt.customerName });
    return { ...(await this.findOne(appt.id, businessId)), depositRefundedCents: keep ? 0 : appt.depositCents, depositKeptCents: keep ? appt.depositCents : 0 };
  }

  // ── Clients ────────────────────────────────────────────────────────────────

  /** A client's history with the shop: their notes, recent visits with what was done and paid, and how reliable they are. */
  async clientHistory(customerId: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId },
      select: { id: true, name: true, phone: true, notes: true, loyaltyPoints: true },
    });
    if (!customer) throw new NotFoundException('Client not found');
    const appts = await this.prisma.appointment.findMany({ where: { businessId, customerId }, orderBy: { scheduledAt: 'desc' }, take: 30 });
    const withServices = await this.withServices(appts);
    const saleIds = appts.map((a) => a.saleId).filter((id): id is string => !!id);
    const sales = saleIds.length === 0 ? [] : await this.prisma.sale.findMany({ where: { id: { in: saleIds }, businessId }, select: { id: true, totalCents: true, receiptNumber: true } });
    const saleOf = new Map(sales.map((x) => [x.id, x]));
    const counts = { completed: 0, noShow: 0, cancelled: 0, upcoming: 0 };
    const grouped = await this.prisma.appointment.groupBy({ by: ['status'], where: { businessId, customerId }, _count: { _all: true } });
    for (const g of grouped) {
      if (g.status === 'COMPLETED') counts.completed = g._count._all;
      else if (g.status === 'NO_SHOW') counts.noShow = g._count._all;
      else if (g.status === 'CANCELLED') counts.cancelled = g._count._all;
      else counts.upcoming += g._count._all;
    }
    const spent = await this.prisma.sale.aggregate({
      where: { businessId, customerId, status: { in: ['PAID', 'COMPLETED', 'AMENDED'] } },
      _sum: { totalCents: true },
    });
    return {
      customer,
      counts,
      spentCents: spent._sum.totalCents ?? 0,
      visits: withServices.map((a) => ({
        id: a.id,
        scheduledAt: a.scheduledAt,
        status: a.status,
        notes: a.notes,
        services: a.services.length > 0 ? a.services.map((x) => String(x.name)) : [],
        totalCents: a.saleId ? saleOf.get(a.saleId)?.totalCents ?? null : null,
        receiptNumber: a.saleId ? saleOf.get(a.saleId)?.receiptNumber ?? null : null,
      })),
    };
  }

  /** The notes the staff keep about a client (allergies, colour formula, preferences). */
  async setClientNotes(customerId: string, notes: unknown, businessId: string) {
    const clean = optionalText(notes, 'Notes', 1000) ?? null;
    const done = await this.prisma.customer.updateMany({ where: { id: customerId, businessId }, data: { notes: clean } });
    if (done.count !== 1) throw new NotFoundException('Client not found');
    return { id: customerId, notes: clean };
  }

  // ── Staff who take appointments ────────────────────────────────────────────

  /**
   * Who can be booked. `stylists` are the users set up to take appointments, with their hours. A manager also gets `others`,
   * the rest of the team, so they can be switched on.
   */
  async listStaff(businessId: string, manager: boolean) {
    const [rows, users] = await Promise.all([
      this.prisma.serviceStaff.findMany({ where: { businessId } }),
      this.prisma.user.findMany({ where: { businessId }, select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
    ]);
    const hoursOf = (raw: string): WorkingHours => { try { return parseWorkingHours(raw); } catch { return {}; } };
    const rowOf = new Map(rows.map((r) => [r.userId, r]));
    const stylists = users
      .filter((u) => rowOf.has(u.id))
      .map((u) => ({ userId: u.id, name: u.name, role: u.role, active: rowOf.get(u.id)!.active, workingHours: hoursOf(rowOf.get(u.id)!.workingHours) }));
    return {
      stylists: manager ? stylists : stylists.filter((x) => x.active),
      ...(manager && { others: users.filter((u) => !rowOf.has(u.id)).map((u) => ({ userId: u.id, name: u.name, role: u.role })) }),
    };
  }

  /** Set a user up to take appointments, switch them off, or change their weekly hours (a manager's call). */
  async saveStaff(userId: string, dto: { active?: boolean; workingHours?: unknown }, businessId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, businessId }, select: { id: true, name: true } });
    if (!user) throw new NotFoundException('That user was not found');
    let hours: WorkingHours | undefined;
    if (dto.workingHours !== undefined) {
      try { hours = parseWorkingHours(dto.workingHours); } catch (e) { throw new BadRequestException((e as Error).message); }
    }
    const data = { ...(dto.active !== undefined && { active: !!dto.active }), ...(hours !== undefined && { workingHours: JSON.stringify(hours) }) };
    await this.prisma.serviceStaff.upsert({
      where: { businessId_userId: { businessId, userId } },
      create: { businessId, userId, active: dto.active ?? true, workingHours: JSON.stringify(hours ?? {}) },
      update: data,
    });
    return this.listStaff(businessId, true);
  }

  /**
   * What each stylist earned from the services they performed in a period: the revenue on their lines and the commission on
   * it at their HR rate. (Payroll adds anything they rang up as cashier; see hr/commission-base.ts.)
   */
  async earnings(businessId: string, from: Date, to: Date) {
    const lines = await this.prisma.saleItem.findMany({
      where: { staffId: { not: null }, sale: { businessId, status: { in: ['PAID', 'COMPLETED', 'AMENDED'] }, createdAt: { gte: from, lte: to } } },
      select: { staffId: true, saleId: true, totalCents: true },
      take: 20000,
    });
    const byStaff = new Map<string, Array<{ saleId: string; totalCents: number }>>();
    for (const l of lines) {
      if (!l.staffId) continue;
      byStaff.set(l.staffId, [...(byStaff.get(l.staffId) ?? []), { saleId: l.saleId, totalCents: l.totalCents }]);
    }
    const ids = [...byStaff.keys()];
    if (ids.length === 0) return [];
    const [users, employees] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids }, businessId }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({ where: { businessId, userId: { in: ids } }, select: { userId: true, commissionRate: true, commissionBasis: true } }),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const empOf = new Map(employees.map((e) => [e.userId, e]));
    return ids
      .map((staffId) => {
        const served = byStaff.get(staffId) ?? [];
        const emp = empOf.get(staffId);
        const base = commissionBase([], served.map((x) => ({ saleId: x.saleId, totalCents: x.totalCents })));
        return {
          staffId,
          name: nameOf.get(staffId) ?? 'Unknown',
          services: served.length,
          revenueCents: base.valueCents,
          commissionRate: emp?.commissionRate ?? null,
          commissionBasis: emp?.commissionBasis ?? null,
          commissionCents: emp ? commissionCents(emp.commissionBasis, emp.commissionRate, base) : null,
        };
      })
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }

  /** A finished or running appointment is part of the customer's history and the day's takings: it is not deleted. */
  async delete(id: string, businessId: string) {
    const appt = await this.findOne(id, businessId);
    if (['COMPLETED', 'IN_PROGRESS'].includes(appt.status)) {
      throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot be deleted`);
    }
    return this.prisma.appointment.delete({ where: { id } });
  }
}
