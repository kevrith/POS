import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { nairobiDay, nairobiDayStart, parseFilterDate } from '../common/dates';
import { taxClassOf } from '@pos/shared';
import { intInRange, oneOf, optionalKraPin, optionalText, text } from '../common/validate';
import { DirectSaleService, type DirectSaleInput, type DirectSaleLine, type DirectSaleResult, type EtimsOutcome } from '../sales/direct-sale.service';
import { ensureServiceItem } from '../sales/vertical-items';

export const CYBER_PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'CREDIT'] as const;
const STATION_TYPES = ['BROWSING', 'GAMING', 'WORKSTATION', 'PRINTING'] as const;
/** Statuses a person may set by hand. IN_USE and PAUSED belong to the session flow. */
const MANUAL_STATION_STATUSES = ['AVAILABLE', 'OFFLINE'] as const;
const RATE_CATEGORIES = ['PRINT', 'SCAN', 'BROWSE', 'GAME', 'OTHER'] as const;
/** KES 100,000 an hour or a single charge: past this it is a typo or a fiddle. */
const MAX_CENTS = 10_000_000;
const MAX_EXTEND_MINUTES = 720;
const LIVE_STATUSES = ['ACTIVE', 'PAUSED'];
/** How long ending a session waits for KRA so the receipt can carry the QR code. */
const ETIMS_WAIT_MS = 5000;
const CYBER_CATEGORY = 'Cyber cafe';
/** What each part of a session's bill is invoiced as. */
const CYBER_ITEM_NAMES = { TIME: 'Cyber computer time', PACKAGE: 'Cyber package', PRINT: 'Cyber print and scan', EXTRAS: 'Cyber extras' } as const;

function describeMinutes(minutes: number): string {
  const m = Math.round(minutes);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}

@Injectable()
export class CybercafeService {
  constructor(private prisma: PrismaService, private events: EventsGateway, private directSales: DirectSaleService) {}

  // ── Stations ──────────────────────────────────────────────────────────────

  async getStations(businessId: string, storeId: string) {
    const stations = await this.prisma.cyberStation.findMany({
      where: { businessId, storeId, isActive: true },
      orderBy: { number: 'asc' },
    });

    // Attach active session to each station
    const activeSessionIds = await this.prisma.cyberSession.findMany({
      where: { businessId, storeId, status: { in: ['ACTIVE', 'PAUSED'] } },
      include: { package: true },
    });
    const sessionByStation = Object.fromEntries(activeSessionIds.map((s) => [s.stationId, s]));

    return stations.map((st) => ({ ...st, activeSession: sessionByStation[st.id] ?? null }));
  }

  async createStation(dto: {
    businessId: string;
    storeId: string;
    number: number;
    label?: string;
    specs?: string;
    ratePerHourCents: number;
    stationType?: string;
  }) {
    if (typeof dto.storeId !== 'string' || !dto.storeId) throw new BadRequestException('storeId is required');
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId: dto.businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');
    const number = intInRange(dto.number, 'Station number', 1, 999);
    const clash = await this.prisma.cyberStation.findFirst({ where: { businessId: dto.businessId, storeId: dto.storeId, number, isActive: true } });
    if (clash) throw new BadRequestException(`Station ${number} already exists`);
    return this.prisma.cyberStation.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        number,
        label: optionalText(dto.label, 'Label', 60),
        specs: optionalText(dto.specs, 'Specs', 200),
        ratePerHourCents: intInRange(dto.ratePerHourCents, 'Hourly rate', 0, MAX_CENTS),
        ...(dto.stationType !== undefined && { stationType: oneOf(dto.stationType, 'Station type', STATION_TYPES) }),
      },
    });
  }

  async updateStation(
    id: string,
    businessId: string,
    dto: { label?: string; specs?: string; ratePerHourCents?: number; status?: string; isActive?: boolean; stationType?: string },
  ) {
    const station = await this.ownedStation(id, businessId);
    if (dto.status !== undefined) {
      oneOf(dto.status, 'Status', MANUAL_STATION_STATUSES);
      // A station with a customer on it is changed by ending or voiding the session, not by editing it.
      if (LIVE_STATUSES.includes(station.status) || station.status === 'IN_USE') {
        throw new BadRequestException(`Station is ${station.status}: end or void its session first`);
      }
    }
    if (dto.isActive === false && station.status === 'IN_USE') {
      throw new BadRequestException('Station is in use: end or void its session first');
    }
    return this.prisma.cyberStation.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: optionalText(dto.label, 'Label', 60) ?? null }),
        ...(dto.specs !== undefined && { specs: optionalText(dto.specs, 'Specs', 200) ?? null }),
        ...(dto.ratePerHourCents !== undefined && { ratePerHourCents: intInRange(dto.ratePerHourCents, 'Hourly rate', 0, MAX_CENTS) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
        ...(dto.stationType !== undefined && { stationType: oneOf(dto.stationType, 'Station type', STATION_TYPES) }),
      },
    });
  }

  // ── Ownership ────────────────────────────────────────────────────────────
  // Ids in paths and bodies are looked up with the caller's business, so another business's record reads as
  // missing. The Prisma middleware covers single-record reads and writes too; this keeps the rule visible.

  private async ownedStation(id: string, businessId: string) {
    const station = await this.prisma.cyberStation.findFirst({ where: { id, businessId } });
    if (!station) throw new NotFoundException('Station not found');
    return station;
  }

  private async ownedSession(id: string, businessId: string) {
    const session = await this.prisma.cyberSession.findFirst({ where: { id, businessId }, include: { package: true } });
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  /**
   * Start a session. The station is claimed with a conditional update inside the same transaction as the
   * session, so two attendants starting the same station at once cannot both win. The hourly rate is the
   * station's; changing it for one session is a manager's call (`canSetRate`).
   */
  async startSession(
    dto: {
      businessId: string;
      stationId: string;
      customerId?: string;
      customerName?: string;
      customerPhone?: string;
      packageId?: string;
      ratePerHourCents?: number;
      notes?: string;
    },
    opts: { canSetRate: boolean },
  ) {
    const station = await this.ownedStation(dto.stationId, dto.businessId);
    if (!station.isActive) throw new BadRequestException('Station is switched off');
    if (station.status !== 'AVAILABLE') throw new BadRequestException(`Station is ${station.status}`);

    let ratePerHourCents = station.ratePerHourCents;
    let pkg: { id: string; priceCents: number; durationMinutes: number } | null = null;
    if (dto.packageId) {
      pkg = await this.prisma.cyberPackage.findFirst({ where: { id: dto.packageId, businessId: dto.businessId, isActive: true } });
      if (!pkg) throw new NotFoundException('Package not found');
      ratePerHourCents = Math.round(pkg.priceCents / (pkg.durationMinutes / 60));
    } else if (dto.ratePerHourCents !== undefined && dto.ratePerHourCents !== null) {
      const requested = intInRange(dto.ratePerHourCents, 'Hourly rate', 0, MAX_CENTS);
      if (requested !== station.ratePerHourCents) {
        if (!opts.canSetRate) throw new ForbiddenException("Only a manager can change a session's hourly rate");
        ratePerHourCents = requested;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cyberStation.updateMany({
        where: { id: station.id, businessId: dto.businessId, status: 'AVAILABLE', isActive: true },
        data: { status: 'IN_USE' },
      });
      if (claimed.count !== 1) throw new BadRequestException('Station was just taken by someone else');
      return tx.cyberSession.create({
        data: {
          businessId: dto.businessId,
          storeId: station.storeId,
          stationId: station.id,
          customerId: optionalText(dto.customerId, 'Customer', 64),
          customerName: optionalText(dto.customerName, 'Customer name', 100),
          customerPhone: optionalText(dto.customerPhone, 'Customer phone', 30),
          packageId: pkg?.id,
          timeLimitMinutes: pkg ? pkg.durationMinutes : undefined,
          ratePerHourCents,
          notes: optionalText(dto.notes, 'Notes', 500),
          startedAt: new Date(),
        },
        include: { station: true, package: true },
      });
    });
  }

  async pauseSession(sessionId: string, businessId: string) {
    const session = await this.ownedSession(sessionId, businessId);
    if (session.status !== 'ACTIVE') throw new BadRequestException('Session is not active');

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cyberSession.updateMany({
        where: { id: sessionId, businessId, status: 'ACTIVE' },
        data: { status: 'PAUSED', pausedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Session is not active');
      await tx.cyberStation.update({ where: { id: session.stationId }, data: { status: 'PAUSED' } });
      return tx.cyberSession.findFirst({ where: { id: sessionId, businessId }, include: { station: true, package: true } });
    });
  }

  async resumeSession(sessionId: string, businessId: string) {
    const session = await this.ownedSession(sessionId, businessId);
    if (session.status !== 'PAUSED') throw new BadRequestException('Session is not paused');

    const pausedMinutesAdded = session.pausedAt ? (Date.now() - session.pausedAt.getTime()) / 60000 : 0;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cyberSession.updateMany({
        where: { id: sessionId, businessId, status: 'PAUSED' },
        data: { status: 'ACTIVE', pausedAt: null, pausedMinutes: { increment: pausedMinutesAdded } },
      });
      if (claimed.count !== 1) throw new BadRequestException('Session is not paused');
      await tx.cyberStation.update({ where: { id: session.stationId }, data: { status: 'IN_USE' } });
      return tx.cyberSession.findFirst({ where: { id: sessionId, businessId }, include: { station: true, package: true } });
    });
  }

  /**
   * End a session and take payment. Billable time excludes pauses. A package covers its own duration at its
   * price; any billable minute beyond that (an extension, or the customer simply staying on) is charged at
   * the package's hourly equivalent, so an extended or overrun package no longer costs the same as one that
   * ended on time.
   *
   * For a business on the sales pipeline the session also becomes a real Sale in the same transaction: the time (or the
   * package and any overrun), the printing and the extras are separate lines, so each carries its own tax class and the
   * receipt says what was bought. Credit is only for a registered customer, pipeline or not.
   */
  async endSession(sessionId: string, businessId: string, dto: {
    paymentMethod?: string;
    paymentRef?: string;
    printPagesCents?: number;
    extrasCents?: number;
    notes?: string;
    customerId?: string;
    buyerKraPin?: string;
  }, actor?: { id?: string }) {
    const session = await this.ownedSession(sessionId, businessId);
    if (!LIVE_STATUSES.includes(session.status)) throw new BadRequestException('Session already ended');

    const paymentMethod = oneOf(dto.paymentMethod, 'Payment method', CYBER_PAYMENT_METHODS);
    const printPagesCents = intInRange(dto.printPagesCents ?? 0, 'Print/scan amount', 0, MAX_CENTS);
    const extrasCents = intInRange(dto.extrasCents ?? 0, 'Extras', 0, MAX_CENTS);
    const buyerKraPin = optionalKraPin(dto.buyerKraPin, 'Buyer KRA PIN');

    // Credit is a debt that has to be chased, so it needs a registered customer: the one on the session, or one named now.
    let creditCustomerId: string | undefined;
    if (paymentMethod === 'CREDIT') {
      creditCustomerId = session.customerId ?? optionalText(dto.customerId, 'Customer', 64);
      if (!creditCustomerId) throw new BadRequestException('A credit session needs a registered customer');
      const known = await this.prisma.customer.count({ where: { id: creditCustomerId, businessId } });
      if (!known) throw new BadRequestException('Customer not found');
    }

    const now = new Date();
    // If still paused, account for that pause time
    const extraPausedMinutes = session.status === 'PAUSED' && session.pausedAt ? (now.getTime() - session.pausedAt.getTime()) / 60000 : 0;
    const totalPausedMinutes = session.pausedMinutes + extraPausedMinutes;
    const elapsedMinutes = (now.getTime() - session.startedAt.getTime()) / 60000;
    const billableMinutes = Math.max(0, elapsedMinutes - totalPausedMinutes);

    let timeCents: number;     // time on a plain session, or the overrun beyond a package
    let packageCents = 0;
    let overMinutes = 0;
    if (session.package) {
      overMinutes = Math.floor(Math.max(0, billableMinutes - session.package.durationMinutes));
      packageCents = session.package.priceCents;
      timeCents = Math.round((overMinutes / 60) * session.ratePerHourCents);
    } else {
      timeCents = Math.round((billableMinutes / 60) * session.ratePerHourCents);
    }
    const totalCents = packageCents + timeCents + printPagesCents + extrasCents;
    const invoice = totalCents > 0 && (await this.directSales.isEnabled(businessId));
    const station = invoice ? await this.ownedStation(session.stationId, businessId) : null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Claim the close: a second End, or two at once, finds the session no longer live.
      const claimed = await tx.cyberSession.updateMany({
        where: { id: sessionId, businessId, status: { in: LIVE_STATUSES } },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          durationMinutes: parseFloat(billableMinutes.toFixed(2)),
          totalCents,
          paymentMethod,
          paymentRef: optionalText(dto.paymentRef, 'Payment reference', 100),
          printPagesCents,
          extrasCents,
          notes: optionalText(dto.notes, 'Notes', 500),
          pausedMinutes: totalPausedMinutes,
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('Session already ended');
      await tx.cyberStation.update({ where: { id: session.stationId }, data: { status: 'AVAILABLE' } });

      let direct: { result: DirectSaleResult; input: DirectSaleInput } | null = null;
      if (invoice && station) {
        const item = (name: string) => ensureServiceItem(tx, { businessId, storeId: session.storeId, category: CYBER_CATEGORY, name });
        const line = async (name: string, label: string, cents: number): Promise<DirectSaleLine> => {
          const it = await item(name);
          return { itemId: it.id, name: label, quantity: 1, unitPriceCents: cents, totalCents: cents, taxClass: taxClassOf(it) };
        };
        const stationName = station.label ?? `PC ${station.number}`;
        const lines: DirectSaleLine[] = [];
        if (session.package && packageCents > 0) lines.push(await line(CYBER_ITEM_NAMES.PACKAGE, `${session.package.name} (${stationName})`, packageCents));
        if (timeCents > 0) {
          lines.push(await line(CYBER_ITEM_NAMES.TIME, session.package ? `Extra time ${describeMinutes(overMinutes)} (${stationName})` : `Computer time ${describeMinutes(billableMinutes)} (${stationName})`, timeCents));
        }
        if (printPagesCents > 0) lines.push(await line(CYBER_ITEM_NAMES.PRINT, 'Printing and scanning', printPagesCents));
        if (extrasCents > 0) lines.push(await line(CYBER_ITEM_NAMES.EXTRAS, 'Other services', extrasCents));

        const onAccount = paymentMethod === 'CREDIT';
        const input: DirectSaleInput = {
          businessId,
          storeId: session.storeId,
          source: 'CYBER',
          // Whose till the money is in: the drawer and the Z-report are counted by cashier.
          cashierId: actor?.id,
          lines,
          payments: onAccount ? [] : [{ method: paymentMethod, amountCents: totalCents, reference: optionalText(dto.paymentRef, 'Payment reference', 100) }],
          onAccount,
          customerId: onAccount ? creditCustomerId : undefined,
          customerName: session.customerName ?? undefined,
          customerPhone: session.customerPhone ?? undefined,
          buyerKraPin,
          notes: `${stationName}, ${describeMinutes(billableMinutes)}`,
        };
        const result = await this.directSales.createInTx(tx, input);
        // updateMany, not update: the tenant middleware checks an `update` by id against rows outside this transaction.
        await tx.cyberSession.updateMany({ where: { id: sessionId, businessId }, data: { saleId: result.sale.id } });
        direct = { result, input };
      }
      return { direct, session: await tx.cyberSession.findFirst({ where: { id: sessionId, businessId }, include: { station: true, package: true } }) };
    });

    if (!outcome.direct) return outcome.session;
    // Books, KRA and the broadcast follow the commit, and cannot undo it. Wait briefly for KRA so the receipt can carry
    // the QR code; if it is slow the session is already billed and the receipt prints without it.
    const after = this.directSales.afterCommit(outcome.direct.result, outcome.direct.input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    return {
      ...outcome.session,
      saleId: outcome.direct.result.sale.id,
      receiptNumber: outcome.direct.result.sale.receiptNumber,
      invoice: outcome.direct.result.sale,
      etims,
    };
  }

  /** Only a running session can be voided. One that has been ended and paid is a closed sale, not a mistake to wipe. */
  async voidSession(sessionId: string, businessId: string, reason?: string) {
    const session = await this.ownedSession(sessionId, businessId);
    if (!LIVE_STATUSES.includes(session.status)) throw new BadRequestException('Only a running session can be voided');

    const note = optionalText(reason, 'Reason', 200);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cyberSession.updateMany({
        where: { id: sessionId, businessId, status: { in: LIVE_STATUSES } },
        data: { status: 'VOIDED', endedAt: new Date(), ...(note && { notes: [session.notes, `Voided: ${note}`].filter(Boolean).join(' | ') }) },
      });
      if (claimed.count !== 1) throw new BadRequestException('Only a running session can be voided');
      // This session is the station's live one, so freeing the station cannot free someone else's.
      await tx.cyberStation.update({ where: { id: session.stationId }, data: { status: 'AVAILABLE' } });
      return tx.cyberSession.findFirst({ where: { id: sessionId, businessId }, include: { station: true } });
    });
  }

  getSessions(businessId: string, storeId: string, filters: { stationId?: string; startDate?: string; endDate?: string; status?: string }) {
    return this.prisma.cyberSession.findMany({
      where: {
        businessId,
        storeId,
        ...(filters.stationId ? { stationId: filters.stationId } : {}),
        ...(filters.status && filters.status !== 'ALL' ? { status: filters.status } : {}),
        ...(filters.startDate || filters.endDate
          ? {
              createdAt: {
                ...(filters.startDate ? { gte: parseFilterDate(filters.startDate, 'start', 'Start date') } : {}),
                ...(filters.endDate ? { lte: parseFilterDate(filters.endDate, 'end', 'End date') } : {}),
              },
            }
          : {}),
      },
      include: { station: true, package: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  // ── Packages ──────────────────────────────────────────────────────────────

  getPackages(businessId: string) {
    return this.prisma.cyberPackage.findMany({
      where: { businessId, isActive: true },
      orderBy: { durationMinutes: 'asc' },
    });
  }

  async createPackage(dto: { businessId: string; name: string; durationMinutes: number; priceCents: number; description?: string }) {
    return this.prisma.cyberPackage.create({
      data: {
        businessId: dto.businessId,
        name: text(dto.name, 'Name', 60),
        durationMinutes: intInRange(dto.durationMinutes, 'Duration (minutes)', 1, 1440),
        priceCents: intInRange(dto.priceCents, 'Price', 0, MAX_CENTS),
        description: optionalText(dto.description, 'Description', 200),
      },
    });
  }

  async updatePackage(id: string, businessId: string, dto: { name?: string; durationMinutes?: number; priceCents?: number; description?: string; isActive?: boolean }) {
    const pkg = await this.prisma.cyberPackage.findFirst({ where: { id, businessId } });
    if (!pkg) throw new NotFoundException('Package not found');
    return this.prisma.cyberPackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: text(dto.name, 'Name', 60) }),
        ...(dto.durationMinutes !== undefined && { durationMinutes: intInRange(dto.durationMinutes, 'Duration (minutes)', 1, 1440) }),
        ...(dto.priceCents !== undefined && { priceCents: intInRange(dto.priceCents, 'Price', 0, MAX_CENTS) }),
        ...(dto.description !== undefined && { description: optionalText(dto.description, 'Description', 200) ?? null }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
      },
    });
  }

  // ── Extend Session ────────────────────────────────────────────────────────

  async extendSession(sessionId: string, businessId: string, extraMinutes: number) {
    const minutes = intInRange(extraMinutes, 'Extra minutes', 1, MAX_EXTEND_MINUTES);
    const session = await this.ownedSession(sessionId, businessId);
    if (!LIVE_STATUSES.includes(session.status)) throw new BadRequestException('Session already ended');
    const claimed = await this.prisma.cyberSession.updateMany({
      where: { id: sessionId, businessId, status: { in: LIVE_STATUSES } },
      data: {
        extendedMinutes: { increment: minutes },
        ...(session.timeLimitMinutes ? { timeLimitMinutes: { increment: minutes } } : {}),
      },
    });
    if (claimed.count !== 1) throw new BadRequestException('Session already ended');
    return this.prisma.cyberSession.findFirst({ where: { id: sessionId, businessId }, include: { station: true, package: true } });
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  getRates(businessId: string, storeId: string) {
    return this.prisma.cyberRate.findMany({
      where: { businessId, storeId, isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createRate(dto: { businessId: string; storeId: string; service: string; unit?: string; rateCents: number; category?: string; sortOrder?: number }) {
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId: dto.businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');
    return this.prisma.cyberRate.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        service: text(dto.service, 'Service', 80),
        unit: optionalText(dto.unit, 'Unit', 30),
        rateCents: intInRange(dto.rateCents, 'Rate', 0, MAX_CENTS),
        category: dto.category === undefined ? undefined : oneOf(dto.category, 'Category', RATE_CATEGORIES),
        sortOrder: intInRange(dto.sortOrder ?? 0, 'Sort order', 0, 9999),
      },
    });
  }

  async updateRate(id: string, businessId: string, dto: { service?: string; unit?: string; rateCents?: number; category?: string; isActive?: boolean; sortOrder?: number }) {
    await this.ownedRate(id, businessId);
    return this.prisma.cyberRate.update({
      where: { id },
      data: {
        ...(dto.service !== undefined && { service: text(dto.service, 'Service', 80) }),
        ...(dto.unit !== undefined && { unit: text(dto.unit, 'Unit', 30) }),
        ...(dto.rateCents !== undefined && { rateCents: intInRange(dto.rateCents, 'Rate', 0, MAX_CENTS) }),
        ...(dto.category !== undefined && { category: oneOf(dto.category, 'Category', RATE_CATEGORIES) }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
        ...(dto.sortOrder !== undefined && { sortOrder: intInRange(dto.sortOrder, 'Sort order', 0, 9999) }),
      },
    });
  }

  async deleteRate(id: string, businessId: string) {
    await this.ownedRate(id, businessId);
    return this.prisma.cyberRate.delete({ where: { id } });
  }

  private async ownedRate(id: string, businessId: string) {
    const rate = await this.prisma.cyberRate.findFirst({ where: { id, businessId } });
    if (!rate) throw new NotFoundException('Rate not found');
    return rate;
  }

  async getKioskData(stationId: string) {
    const station = await this.prisma.cyberStation.findUnique({
      where: { id: stationId },
      select: { id: true, number: true, label: true, stationType: true, status: true, ratePerHourCents: true },
    });
    if (!station) throw new NotFoundException('Station not found');

    const activeSession = await this.prisma.cyberSession.findFirst({
      where: { stationId, status: { in: ['ACTIVE', 'PAUSED'] } },
      select: {
        id: true, customerName: true, startedAt: true, pausedAt: true,
        pausedMinutes: true, extendedMinutes: true, timeLimitMinutes: true,
        status: true, ratePerHourCents: true,
        package: { select: { name: true, durationMinutes: true, priceCents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { station, session: activeSession ?? null };
  }

  async getDailySummary(businessId: string, storeId: string) {
    // Today is the Nairobi day: a server in UTC would start it at 03:00.
    const todayStart = nairobiDayStart(nairobiDay(new Date()));

    const [completed, active, stations] = await Promise.all([
      this.prisma.cyberSession.aggregate({
        where: { businessId, storeId, status: 'COMPLETED', createdAt: { gte: todayStart } },
        _sum: { totalCents: true, durationMinutes: true },
        _count: true,
      }),
      this.prisma.cyberSession.count({ where: { businessId, storeId, status: { in: ['ACTIVE', 'PAUSED'] } } }),
      this.prisma.cyberStation.count({ where: { businessId, storeId, isActive: true } }),
    ]);

    return {
      todayRevenueCents: completed._sum.totalCents ?? 0,
      todaySessions: completed._count,
      todayMinutes: completed._sum.durationMinutes ?? 0,
      activeSessions: active,
      totalStations: stations,
    };
  }

  // ── Statistics ────────────────────────────────────────────────────────────

  async getStats(businessId: string, storeId: string, startDate?: string, endDate?: string) {
    const where: any = {
      businessId,
      storeId,
      status: 'COMPLETED',
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
              ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
            },
          }
        : {}),
    };

    const [totals, byStation, byPayment] = await Promise.all([
      this.prisma.cyberSession.aggregate({
        where,
        _sum: { totalCents: true, durationMinutes: true },
        _count: true,
      }),
      this.prisma.cyberSession.groupBy({
        by: ['stationId'],
        where,
        _sum: { totalCents: true, durationMinutes: true },
        _count: true,
      }),
      this.prisma.cyberSession.groupBy({
        by: ['paymentMethod'],
        where,
        _sum: { totalCents: true },
        _count: true,
      }),
    ]);

    const stations = await this.prisma.cyberStation.findMany({ where: { businessId, storeId } });
    const stationMap = Object.fromEntries(stations.map((s) => [s.id, s.label ?? `PC ${s.number}`]));

    // Station availability today
    const availableCount = stations.filter((s) => s.status === 'AVAILABLE' && s.isActive).length;
    const inUseCount = stations.filter((s) => s.status === 'IN_USE').length;
    const pausedCount = stations.filter((s) => s.status === 'PAUSED').length;

    return {
      totalRevenueCents: totals._sum.totalCents ?? 0,
      totalMinutes: totals._sum.durationMinutes ?? 0,
      totalSessions: totals._count,
      avgSessionMinutes: totals._count > 0 ? (totals._sum.durationMinutes ?? 0) / totals._count : 0,
      stationStatus: { available: availableCount, inUse: inUseCount, paused: pausedCount, total: stations.filter((s) => s.isActive).length },
      byStation: byStation.map((s) => ({
        stationId: s.stationId,
        stationName: stationMap[s.stationId] ?? s.stationId,
        revenueCents: s._sum.totalCents ?? 0,
        minutes: s._sum.durationMinutes ?? 0,
        sessions: s._count,
      })),
      byPayment: byPayment.map((p) => ({
        method: p.paymentMethod ?? 'UNKNOWN',
        count: p._count,
        totalCents: p._sum.totalCents ?? 0,
      })),
    };
  }

  // ── Kiosk: call attendant ─────────────────────────────────────────────────

  async callAttendant(stationId: string) {
    const station = await this.prisma.cyberStation.findUnique({
      where: { id: stationId },
      select: { id: true, number: true, label: true, businessId: true },
    });
    if (!station) throw new NotFoundException('Station not found');

    this.events.emitCyberCallAttendant(station.businessId, {
      stationId: station.id,
      stationNumber: station.number,
      stationLabel: station.label,
      calledAt: new Date().toISOString(),
    });

    return { ok: true };
  }
}
