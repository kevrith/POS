import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { taxClassOf } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, oneOf, optionalKraPin, optionalText, requireArray, text } from '../common/validate';
import { nairobiDay, nairobiDayEnd, nairobiDayStart } from '../common/dates';
import { LedgerService } from '../ledger/ledger.service';
import { DirectSaleService, type DirectSaleInput, type DirectSaleResult, type EtimsOutcome } from '../sales/direct-sale.service';
import { postDepositJournal } from '../sales/sale-ledger';
import { DEPOSIT_METHODS, knownDepositMethod, refundMethodFor } from '../sales/deposit-register';
import { ensureServiceItem } from '../sales/vertical-items';

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
    return this.prisma.appointment.findMany({ where, orderBy: { scheduledAt: 'asc' } });
  }

  async findOne(id: string, businessId: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, businessId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  private when(value: unknown): Date {
    const d = new Date(String(value ?? ''));
    if (Number.isNaN(d.getTime())) throw new BadRequestException('scheduledAt is not a valid date and time');
    return d;
  }

  /** Throws if the staff member already has a held appointment overlapping [start, start + duration). */
  private async assertStaffFree(
    tx: { appointment: { findMany: PrismaService['appointment']['findMany'] }; $executeRaw: PrismaService['$executeRaw'] },
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
        staffId,
        status: { in: HOLDING },
        ...(ignoreId && { id: { not: ignoreId } }),
        scheduledAt: { gte: new Date(start.getTime() - 12 * 60 * MIN_MS), lt: end },
      },
    });
    const clash = near.find((a) => new Date(a.scheduledAt.getTime() + a.duration * MIN_MS) > start);
    if (clash) {
      const at = clash.scheduledAt.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
      throw new ConflictException(`That staff member is already booked at ${at} for ${clash.customerName}.`);
    }
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    serviceItemId?: string;
    staffId?: string;
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
    const duration = intInRange(dto.duration ?? 60, 'Duration (minutes)', 5, 720);
    const depositCents = intInRange(dto.depositCents ?? 0, 'Deposit', 0, 1_000_000_000);

    if (dto.customerId) {
      const c = await this.prisma.customer.count({ where: { id: dto.customerId, businessId: dto.businessId } });
      if (!c) throw new BadRequestException('Customer not found');
    }
    if (dto.serviceItemId) {
      const i = await this.prisma.item.count({ where: { id: dto.serviceItemId, businessId: dto.businessId } });
      if (!i) throw new BadRequestException('Service not found');
    }
    const staffId = optionalText(dto.staffId, 'Staff', 64);
    // On the sales pipeline a deposit is money taken: it needs a method, and goes in the deposit register.
    const register = depositCents > 0 && (await this.directSales.isEnabled(dto.businessId));
    const depositMethod = register ? oneOf(String(dto.depositMethod ?? '').toUpperCase(), 'Deposit method', DEPOSIT_METHODS) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      if (staffId) await this.assertStaffFree(tx, dto.businessId, staffId, scheduledAt, duration);
      const appt = await tx.appointment.create({
        data: {
          businessId: dto.businessId,
          storeId: dto.storeId,
          customerId: dto.customerId,
          customerName: text(dto.customerName, 'Customer name', 120),
          customerPhone: optionalText(dto.customerPhone, 'Customer phone', 30),
          serviceItemId: dto.serviceItemId,
          staffId,
          scheduledAt,
          duration,
          notes: optionalText(dto.notes, 'Notes', 500),
          depositCents,
        },
      });
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
    return created.appt;
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
      scheduledAt: string; duration: number; status: string; notes: string; depositCents: number;
      /** Completing, on the sales pipeline: what the customer pays now, a manager's price, a company PIN. */
      payments: Array<{ method: string; amountCents: number }>; amountCents: number; buyerKraPin: string;
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

    const reschedules = dto.scheduledAt !== undefined || dto.duration !== undefined || dto.staffId !== undefined;
    if (reschedules && !HOLDING.includes(appt.status)) {
      throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot be rescheduled`);
    }

    const scheduledAt = dto.scheduledAt !== undefined ? this.when(dto.scheduledAt) : appt.scheduledAt;
    const duration = dto.duration !== undefined ? intInRange(dto.duration, 'Duration (minutes)', 5, 720) : appt.duration;
    const staffId = dto.staffId !== undefined ? (optionalText(dto.staffId, 'Staff', 64) ?? null) : appt.staffId;

    return this.prisma.$transaction(async (tx) => {
      // Moving into (or staying in) a held state with a staff member: the slot must be free.
      const finalStatus = status ?? appt.status;
      if (reschedules && staffId && HOLDING.includes(finalStatus)) {
        await this.assertStaffFree(tx, businessId, staffId, scheduledAt, duration, id);
      }
      return tx.appointment.update({
        where: { id },
        data: {
          ...(status && { status }),
          ...(dto.scheduledAt !== undefined && { scheduledAt }),
          ...(dto.duration !== undefined && { duration }),
          ...(dto.staffId !== undefined && { staffId }),
          ...(dto.customerName !== undefined && { customerName: text(dto.customerName, 'Customer name', 120) }),
          ...(dto.customerPhone !== undefined && { customerPhone: optionalText(dto.customerPhone, 'Customer phone', 30) ?? null }),
          ...(dto.serviceItemId !== undefined && { serviceItemId: dto.serviceItemId || null }),
          ...(dto.notes !== undefined && { notes: optionalText(dto.notes, 'Notes', 500) ?? null }),
          ...(dto.depositCents !== undefined && { depositCents: intInRange(dto.depositCents, 'Deposit', 0, 1_000_000_000) }),
        },
      });
    });
  }

  /**
   * Complete an appointment on the sales pipeline: it becomes ONE real sale, in the same transaction as the status
   * change. The service is its catalogue item at the catalogue price (a manager can change that price; an appointment
   * with no priced service takes whatever price is entered). The deposit already held pays for it, up to the bill; what
   * is left is paid now, and a deposit larger than the bill is paid back.
   */
  private async complete(
    appt: { id: string; storeId: string; status: string; customerName: string; customerPhone: string | null; serviceItemId: string | null; depositCents: number; scheduledAt: Date },
    dto: { payments?: Array<{ method: string; amountCents: number }>; amountCents?: number; buyerKraPin?: string; refundMethod?: string },
    businessId: string,
    actor: Actor,
  ) {
    const tenders = requireArray<{ method: string; amountCents: number }>(dto.payments ?? [], 'payments').map((p) => ({
      method: oneOf(String(p?.method ?? '').toUpperCase(), 'Payment method', PAYMENT_METHODS),
      amountCents: intInRange(p?.amountCents, 'Payment amount', 1, MAX_CENTS),
    }));
    const buyerKraPin = optionalKraPin(dto.buyerKraPin, 'Buyer KRA PIN');
    const item = appt.serviceItemId ? await this.prisma.item.findFirst({ where: { id: appt.serviceItemId, businessId } }) : null;
    const listPrice = item?.retailPriceCents ?? 0;
    let priceCents = listPrice;
    if (dto.amountCents !== undefined && dto.amountCents !== null && String(dto.amountCents) !== '') {
      const asked = intInRange(dto.amountCents, 'Price', 1, MAX_CENTS);
      // Changing a listed price is a manager's call; with no list price there is nothing to change.
      if (listPrice > 0 && asked !== listPrice && !MANAGER_ROLES.includes(String(actor.role))) {
        throw new ForbiddenException("Only a manager can change a service's price");
      }
      priceCents = asked;
    }
    if (!(priceCents > 0)) throw new BadRequestException('This appointment has no priced service. Choose the service in the catalogue, or enter the price');

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

      const serviceItem = item ?? (await ensureServiceItem(tx, { businessId, storeId: appt.storeId, category: 'Appointments', name: 'Appointment service' }));
      const input: DirectSaleInput = {
        businessId,
        storeId: appt.storeId,
        cashierId: actor.id,
        source: 'APPOINTMENT',
        lines: [{ itemId: serviceItem.id, name: item?.name ?? 'Appointment service', quantity: 1, unitPriceCents: priceCents, totalCents: priceCents, taxClass: taxClassOf(serviceItem) }],
        payments: [...(applied > 0 ? [{ method: 'DEPOSIT', amountCents: applied }] : []), ...tenders],
        customerName: appt.customerName,
        customerPhone: appt.customerPhone ?? undefined,
        buyerKraPin,
        notes: `Appointment ${nairobiDay(appt.scheduledAt)}`,
      };
      const result = await this.directSales.createInTx(tx, input);
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
      return { direct: { result, input } as { result: DirectSaleResult; input: DirectSaleInput }, refund };
    });

    // Books, KRA and the broadcast follow the commit, and cannot undo it. Wait briefly for KRA so the receipt can carry
    // the QR code; if it is slow the appointment is already billed and the receipt prints without it.
    const after = this.directSales.afterCommit(outcome.direct.result, outcome.direct.input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    if (outcome.refund) this.postDepositLedger('REFUNDED', { ...outcome.refund, businessId, storeId: appt.storeId, who: appt.customerName });

    const sale = outcome.direct.result.sale;
    return {
      ...(await this.findOne(appt.id, businessId)),
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      invoice: sale,
      etims,
      changeDueCents: Math.max(0, tendered - due),
      refundDueCents: surplus,
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

  /** A finished or running appointment is part of the customer's history and the day's takings: it is not deleted. */
  async delete(id: string, businessId: string) {
    const appt = await this.findOne(id, businessId);
    if (['COMPLETED', 'IN_PROGRESS'].includes(appt.status)) {
      throw new BadRequestException(`A ${appt.status.toLowerCase().replace(/_/g, ' ')} appointment cannot be deleted`);
    }
    return this.prisma.appointment.delete({ where: { id } });
  }
}
