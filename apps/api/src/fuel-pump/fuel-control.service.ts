import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseFilterDate } from '../common/dates';
import { intInRange, numberInRange, oneOf, optionalText, text } from '../common/validate';
import {
  cashVariance, checkDelivery, hasMeterGap, meterGap, reconcileNozzle, round3, weightedAverageCost, wetStockStatus,
} from './fuel-control';

const MAX_UNIT_COST_CENTS = 100_000;
const MAX_ATTENDANTS = 30;
const MAX_TEST_LITRES = 200;
const TEST_REASONS = ['ROUTINE', 'CALIBRATION', 'INSPECTION'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type OwnedModel = 'fuelTank' | 'fuelNozzle' | 'fuelShift';

/**
 * The controls of a forecourt: shifts with meter readings and cash handed in, tank readings against the books,
 * deliveries measured against the supplier's note, and pump tests. Each compares two records that do not depend on
 * each other, which is what makes a shortage visible.
 */
@Injectable()
export class FuelControlService {
  constructor(private prisma: PrismaService) {}

  private async owned(model: OwnedModel, id: unknown, businessId: string, label: string) {
    if (typeof id !== 'string' || !id) throw new BadRequestException(`${label} is required`);
    const row = await (this.prisma as any)[model].findFirst({ where: { id, businessId } });
    if (!row) throw new NotFoundException(`${label} not found`);
    return row;
  }

  private async assertStore(storeId: unknown, businessId: string) {
    if (typeof storeId !== 'string' || !storeId) throw new BadRequestException('storeId is required');
    const store = await this.prisma.store.findFirst({ where: { id: storeId, businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');
  }

  private dateRange(field: string, startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return {};
    return {
      [field]: {
        ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
        ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
      },
    };
  }

  // ── Tank readings ───────────────────────────────────────────────────────────

  /**
   * A reading of what is really in the tank. It is compared with what the books said a moment ago, and the
   * difference is kept on the reading: that is the record of fuel lost or gained, which used to be overwritten.
   * The first reading of a new tank is its opening level, recorded as such.
   */
  async recordDipping(dto: { businessId: string; tankId: string; litres: number; recordedBy: string; notes?: string; waterMm?: number }) {
    const tank = await this.owned('fuelTank', dto.tankId, dto.businessId, 'Tank');
    const litres = numberInRange(dto.litres, 'Dipping reading', { min: 0, max: tank.capacityLitres });
    const waterMm = dto.waterMm === undefined || dto.waterMm === null || (dto.waterMm as unknown) === ''
      ? undefined
      : numberInRange(dto.waterMm, 'Water level', { min: 0, max: 5000 });
    const recordedBy = text(dto.recordedBy, 'Recorded by', 100);
    const notes = optionalText(dto.notes, 'Notes', 500);

    return this.prisma.$transaction(async (tx) => {
      // Lock the tank so a sale cannot slip between reading the book level and replacing it.
      const rows = await tx.$queryRaw<Array<{ currentLitres: number }>>`SELECT "currentLitres" FROM "FuelTank" WHERE "id" = ${tank.id} AND "businessId" = ${dto.businessId} FOR UPDATE`;
      if (rows.length !== 1) throw new NotFoundException('Tank not found');
      const book = rows[0].currentLitres;
      // The first reading of a tank that has never held fuel on the books sets its opening level. It is not a gain:
      // counting it as one would show a huge, false finding in the wet stock report.
      const opening = book === 0 && (await tx.fuelTankDipping.count({ where: { tankId: tank.id, businessId: dto.businessId } })) === 0;
      const dipping = await tx.fuelTankDipping.create({
        data: {
          businessId: dto.businessId, tankId: tank.id, litres, recordedBy, notes, waterMm,
          bookLitres: round3(opening ? litres : book), varianceLitres: opening ? 0 : round3(litres - book), kind: opening ? 'OPENING' : 'DIP',
        },
      });
      await tx.fuelTank.updateMany({ where: { id: tank.id, businessId: dto.businessId }, data: { currentLitres: litres } });
      return dipping;
    });
  }

  async getDippings(businessId: string, tankId: string) {
    await this.owned('fuelTank', tankId, businessId, 'Tank');
    return this.prisma.fuelTankDipping.findMany({ where: { tankId, businessId }, orderBy: { recordedAt: 'desc' }, take: 30 });
  }

  /**
   * Fuel arriving. With a dip before and after the offload, the tank's own measurement decides what was received
   * and the difference from the supplier's note is recorded as a shortage. Without dips the note is taken as read.
   * A priced delivery moves the tank's average cost, which later sales carry as their cost.
   */
  async recordDelivery(dto: {
    businessId: string; tankId: string; litresDelivered?: number; docketLitres?: number;
    dipBeforeLitres?: number; dipAfterLitres?: number; unitCostCents?: number; vehiclePlate?: string;
    supplierName?: string; docketNumber?: string; deliveredBy?: string; notes?: string; recordedBy?: string;
  }) {
    const tank = await this.owned('fuelTank', dto.tankId, dto.businessId, 'Tank');
    const docketLitres = numberInRange(dto.docketLitres ?? dto.litresDelivered, 'Litres on the delivery note', { min: 0, max: tank.capacityLitres, exclusiveMin: true });
    const hasBefore = dto.dipBeforeLitres !== undefined && dto.dipBeforeLitres !== null && (dto.dipBeforeLitres as unknown) !== '';
    const hasAfter = dto.dipAfterLitres !== undefined && dto.dipAfterLitres !== null && (dto.dipAfterLitres as unknown) !== '';
    if (hasBefore !== hasAfter) throw new BadRequestException('Give both tank readings, before and after the offload, or neither');
    const dipBefore = hasBefore ? numberInRange(dto.dipBeforeLitres, 'Reading before the offload', { min: 0, max: tank.capacityLitres }) : null;
    const dipAfter = hasAfter ? numberInRange(dto.dipAfterLitres, 'Reading after the offload', { min: 0, max: tank.capacityLitres }) : null;
    if (dipBefore !== null && dipAfter !== null && dipAfter <= dipBefore) {
      throw new BadRequestException('The reading after the offload must be higher than the reading before it');
    }
    const unitCostCents = dto.unitCostCents === undefined || dto.unitCostCents === null || (dto.unitCostCents as unknown) === ''
      ? undefined
      : intInRange(dto.unitCostCents, 'Cost per litre', 1, MAX_UNIT_COST_CENTS);
    const who = text(dto.recordedBy ?? dto.deliveredBy ?? 'System', 'Recorded by', 100);

    const check = checkDelivery({ docketLitres, dipBefore, dipAfter });

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ currentLitres: number; avgCostCents: number; capacityLitres: number }>>`
        SELECT "currentLitres", "avgCostCents", "capacityLitres" FROM "FuelTank" WHERE "id" = ${tank.id} AND "businessId" = ${dto.businessId} FOR UPDATE`;
      if (rows.length !== 1) throw new NotFoundException('Tank not found');
      const { currentLitres: book, avgCostCents: avgCost, capacityLitres } = rows[0];

      let bookBeforeOffload = book;
      let newLevel: number;
      if (dipBefore !== null && dipAfter !== null) {
        // The measured level before the offload corrects the books first, so a missing-fuel finding is not hidden
        // inside the delivery.
        await tx.fuelTankDipping.create({
          data: {
            businessId: dto.businessId, tankId: tank.id, litres: dipBefore, recordedBy: who, kind: 'BEFORE_DELIVERY',
            bookLitres: round3(book), varianceLitres: round3(dipBefore - book), notes: optionalText(dto.docketNumber, 'Docket number', 50),
          },
        });
        bookBeforeOffload = dipBefore;
        newLevel = dipAfter;
      } else {
        // A delivery that does not fit means the book level is wrong, not that fuel vanished. Silently capping
        // it would record litres the tank never received.
        const room = capacityLitres - book;
        if (check.receivedLitres > room + 0.0005) {
          throw new BadRequestException(
            `That delivery does not fit: the tank has ${room.toFixed(2)}L of room on the books. Record a dipping first if the level is out of date.`,
          );
        }
        newLevel = book + check.receivedLitres;
      }

      const delivery = await tx.fuelDelivery.create({
        data: {
          businessId: dto.businessId,
          tankId: tank.id,
          litresDelivered: check.receivedLitres,
          docketLitres,
          shortLitres: check.shortLitres,
          dipBeforeLitres: dipBefore,
          dipAfterLitres: dipAfter,
          unitCostCents,
          totalCostCents: unitCostCents !== undefined ? Math.round(docketLitres * unitCostCents) : undefined,
          vehiclePlate: optionalText(dto.vehiclePlate, 'Vehicle plate', 20)?.toUpperCase(),
          supplierName: optionalText(dto.supplierName, 'Supplier', 100),
          docketNumber: optionalText(dto.docketNumber, 'Docket number', 50),
          deliveredBy: optionalText(dto.deliveredBy, 'Delivered by', 100),
          notes: optionalText(dto.notes, 'Notes', 500),
        },
      });
      if (dipAfter !== null) {
        await tx.fuelTankDipping.create({
          data: { businessId: dto.businessId, tankId: tank.id, litres: dipAfter, recordedBy: who, kind: 'AFTER_DELIVERY', bookLitres: round3(dipAfter), varianceLitres: 0 },
        });
      }
      await tx.fuelTank.updateMany({
        where: { id: tank.id, businessId: dto.businessId },
        data: {
          currentLitres: round3(newLevel),
          ...(unitCostCents !== undefined && { avgCostCents: weightedAverageCost(bookBeforeOffload, avgCost, check.receivedLitres, unitCostCents) }),
        },
      });
      return { ...delivery, isShort: check.isShort, shortPct: check.shortPct };
    });
  }

  getDeliveries(businessId: string, startDate?: string, endDate?: string) {
    return this.prisma.fuelDelivery.findMany({
      where: { businessId, ...this.dateRange('deliveredAt', startDate, endDate) },
      include: { tank: { include: { grade: true } } },
      orderBy: { deliveredAt: 'desc' },
      take: 100,
    });
  }

  // ── Wet stock ───────────────────────────────────────────────────────────────

  /**
   * Fuel gained or lost in each tank over a period: the differences between what was measured and what the books
   * said, as a share of what was sold from it. Negative = missing. A tank nobody has measured recently is flagged,
   * because a loss cannot be seen until it is measured.
   */
  async getVarianceReport(businessId: string, storeId: string, startDate?: string, endDate?: string) {
    const tanks = await this.prisma.fuelTank.findMany({ where: { businessId, storeId, isActive: true }, include: { grade: true }, orderBy: { tankNumber: 'asc' } });
    const inPeriod = (field: string) => this.dateRange(field, startDate, endDate);
    const now = Date.now();

    // A sale from before nozzles kept no tank; it is attributed only where the grade has a single tank to name.
    const tanksPerGrade = new Map<string, number>();
    for (const t of tanks) tanksPerGrade.set(t.gradeId, (tanksPerGrade.get(t.gradeId) ?? 0) + 1);

    return Promise.all(tanks.map(async (tank) => {
      const [soldAgg, legacyAgg, dips, deliveries, lastDip] = await Promise.all([
        this.prisma.fuelSale.aggregate({ where: { businessId, storeId, tankId: tank.id, status: 'COMPLETED', ...inPeriod('createdAt') }, _sum: { litresDispensed: true } }),
        tanksPerGrade.get(tank.gradeId) === 1
          ? this.prisma.fuelSale.aggregate({ where: { businessId, storeId, gradeId: tank.gradeId, tankId: null, status: 'COMPLETED', ...inPeriod('createdAt') }, _sum: { litresDispensed: true } })
          : Promise.resolve({ _sum: { litresDispensed: 0 } }),
        this.prisma.fuelTankDipping.findMany({ where: { tankId: tank.id, businessId, ...inPeriod('recordedAt') }, orderBy: { recordedAt: 'asc' } }),
        this.prisma.fuelDelivery.findMany({ where: { tankId: tank.id, businessId, ...inPeriod('deliveredAt') } }),
        this.prisma.fuelTankDipping.findFirst({ where: { tankId: tank.id, businessId }, orderBy: { recordedAt: 'desc' } }),
      ]);
      const soldLitres = round3((soldAgg._sum.litresDispensed ?? 0) + (legacyAgg._sum.litresDispensed ?? 0));
      const varianceLitres = round3(dips.reduce((t, d) => t + (d.varianceLitres ?? 0), 0));
      const { variancePct, status } = wetStockStatus(varianceLitres, soldLitres);
      const hoursSinceDip = lastDip ? Math.floor((now - lastDip.recordedAt.getTime()) / (DAY_MS / 24)) : null;
      return {
        tankId: tank.id,
        tankNumber: tank.tankNumber,
        label: tank.label ?? `Tank ${tank.tankNumber}`,
        gradeName: tank.grade.name,
        capacityLitres: tank.capacityLitres,
        bookLitres: tank.currentLitres,
        minLevelLitres: tank.minLevelLitres,
        belowMinimum: tank.currentLitres < tank.minLevelLitres,
        soldLitres,
        deliveredLitres: round3(deliveries.reduce((t, d) => t + d.litresDelivered, 0)),
        shortDeliveryLitres: round3(deliveries.reduce((t, d) => t + (d.shortLitres ?? 0), 0)),
        dipCount: dips.length,
        varianceLitres,
        variancePct,
        status,
        lastDipAt: lastDip?.recordedAt ?? null,
        lastDipLitres: lastDip?.litres ?? null,
        hoursSinceDip,
        dipOverdue: hoursSinceDip === null || hoursSinceDip > 24,
        waterMm: lastDip?.waterMm ?? null,
        avgCostCents: tank.avgCostCents,
      };
    }));
  }

  // ── Pump tests ──────────────────────────────────────────────────────────────

  /**
   * Fuel drawn to test a pump and poured back. It moves the meter, so the shift needs to know it was not a sale.
   * The tank is not touched: the fuel went back.
   */
  async recordPumpTest(dto: { businessId: string; nozzleId: string; litres: number; reason?: string; notes?: string; recordedBy: string }) {
    const nozzle = await this.owned('fuelNozzle', dto.nozzleId, dto.businessId, 'Nozzle');
    const litres = numberInRange(dto.litres, 'Test litres', { min: 0, max: MAX_TEST_LITRES, exclusiveMin: true });
    const reason = oneOf(String(dto.reason ?? 'ROUTINE').toUpperCase(), 'Reason', TEST_REASONS);
    const shift = await this.prisma.fuelShift.findFirst({
      where: { businessId: dto.businessId, storeId: nozzle.storeId, status: 'OPEN' },
      include: { readings: true },
    });
    if (!shift) throw new BadRequestException('No shift is open. Open a shift before testing a pump.');
    if (!shift.readings.some((r) => r.nozzleId === nozzle.id)) throw new BadRequestException('This nozzle is not on the open shift');
    return this.prisma.fuelPumpTest.create({
      data: {
        businessId: dto.businessId, storeId: nozzle.storeId, nozzleId: nozzle.id, shiftId: shift.id, litres, reason,
        recordedBy: text(dto.recordedBy, 'Recorded by', 100), notes: optionalText(dto.notes, 'Notes', 500),
      },
    });
  }

  getPumpTests(businessId: string, storeId: string, shiftId?: string) {
    return this.prisma.fuelPumpTest.findMany({
      where: { businessId, storeId, ...(shiftId ? { shiftId } : {}) },
      include: { nozzle: { select: { nozzleNumber: true, pump: { select: { pumpNumber: true, label: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Shifts ──────────────────────────────────────────────────────────────────

  getShifts(businessId: string, storeId: string) {
    return this.prisma.fuelShift.findMany({
      where: { businessId, storeId },
      include: { readings: true, attendants: true },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });
  }

  getOpenShift(businessId: string, storeId: string) {
    return this.prisma.fuelShift.findFirst({
      where: { businessId, storeId, status: 'OPEN' },
      include: { readings: true, attendants: true },
    });
  }

  /**
   * Open a shift: who is on which pumps, and where each nozzle's meter stands. Every nozzle that will sell must
   * be read and given to one attendant, so no litre is ever without someone answering for it. An opening reading
   * that does not continue from the last close is accepted only with a reason.
   */
  async openShift(dto: {
    businessId: string;
    storeId: string;
    cashierId?: string;
    cashierName: string;
    attendants: Array<{ name: string; userId?: string; nozzleIds: string[] }>;
    readings: Array<{ nozzleId: string; openingLitres: number; note?: string }>;
  }) {
    await this.assertStore(dto.storeId, dto.businessId);
    const cashierName = text(dto.cashierName, 'Opened by', 100);

    const attendants = (Array.isArray(dto.attendants) ? dto.attendants : []).map((a) => ({
      name: text(a?.name, 'Attendant name', 100),
      userId: optionalText(a?.userId, 'Attendant', 64),
      nozzleIds: (Array.isArray(a?.nozzleIds) ? a.nozzleIds : []).map((n) => text(n, 'Nozzle', 64)),
    }));
    if (attendants.length === 0) throw new BadRequestException('Add at least one attendant');
    if (attendants.length > MAX_ATTENDANTS) throw new BadRequestException(`A shift has at most ${MAX_ATTENDANTS} attendants`);
    if (attendants.some((a) => a.nozzleIds.length === 0)) throw new BadRequestException('Every attendant needs at least one nozzle');

    const assigned = attendants.flatMap((a) => a.nozzleIds);
    if (new Set(assigned).size !== assigned.length) throw new BadRequestException('A nozzle can be given to only one attendant');

    const readings = (Array.isArray(dto.readings) ? dto.readings : []).map((r) => ({
      nozzleId: text(r?.nozzleId, 'Nozzle', 64),
      openingLitres: numberInRange(r?.openingLitres, 'Opening reading', { min: 0, max: 1e9 }),
      note: optionalText(r?.note, 'Note', 200),
    }));
    if (new Set(readings.map((r) => r.nozzleId)).size !== readings.length) throw new BadRequestException('Each nozzle can have only one opening reading');
    const readIds = new Set(readings.map((r) => r.nozzleId));
    if (readIds.size !== assigned.length || assigned.some((n) => !readIds.has(n))) {
      throw new BadRequestException('Each nozzle on the shift needs exactly one attendant and one opening reading');
    }

    const nozzles = await this.prisma.fuelNozzle.findMany({
      where: { id: { in: assigned }, businessId: dto.businessId, storeId: dto.storeId, isActive: true },
      include: { pump: { select: { pumpNumber: true } } },
    });
    if (nozzles.length !== assigned.length) throw new BadRequestException('A nozzle named here is not an active nozzle of this store');
    const byId = new Map(nozzles.map((n) => [n.id, n]));

    const userIds = attendants.map((a) => a.userId).filter((u): u is string => !!u);
    if (userIds.length > 0) {
      const found = await this.prisma.user.count({ where: { id: { in: userIds }, businessId: dto.businessId } });
      if (found !== new Set(userIds).size) throw new BadRequestException('An attendant named here is not on your team');
    }

    // A meter that does not pick up where it stopped means fuel moved with nobody watching, or a meter was replaced.
    const prepared = readings.map((r) => {
      const nozzle = byId.get(r.nozzleId) as NonNullable<ReturnType<typeof byId.get>>;
      let previousClosingLitres: number | undefined;
      if (nozzle.lastReadingAt) {
        const gap = meterGap(nozzle.totalizerLitres, r.openingLitres);
        if (hasMeterGap(gap)) {
          if (!r.note) {
            throw new BadRequestException(
              `Pump ${nozzle.pump.pumpNumber} nozzle ${nozzle.nozzleNumber}: the meter reads ${r.openingLitres} but it closed at ${nozzle.totalizerLitres} last time. Add a note saying why.`,
            );
          }
          previousClosingLitres = nozzle.totalizerLitres;
        }
      }
      return { ...r, previousClosingLitres, pumpId: nozzle.pumpId };
    });

    return this.prisma.$transaction(async (tx) => {
      // One open shift per store, even when two people press Open at once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fuelshift:${dto.storeId}`}))`;
      const open = await tx.fuelShift.findFirst({ where: { businessId: dto.businessId, storeId: dto.storeId, status: 'OPEN' } });
      if (open) throw new BadRequestException('A shift is already open. Close it before opening another.');

      const shift = await tx.fuelShift.create({
        data: { businessId: dto.businessId, storeId: dto.storeId, cashierId: dto.cashierId, cashierName },
      });
      const attendantIds = new Map<string, string>();
      for (const a of attendants) {
        const row = await tx.fuelShiftAttendant.create({
          data: { shiftId: shift.id, businessId: dto.businessId, userId: a.userId, name: a.name, nozzleIds: a.nozzleIds },
        });
        for (const n of a.nozzleIds) attendantIds.set(n, row.id);
      }
      for (const r of prepared) {
        await tx.fuelShiftReading.create({
          data: {
            shiftId: shift.id, pumpId: r.pumpId, nozzleId: r.nozzleId, attendantId: attendantIds.get(r.nozzleId),
            openingLitres: r.openingLitres, previousClosingLitres: r.previousClosingLitres, openingNote: r.note,
          },
        });
        await tx.fuelNozzle.updateMany({ where: { id: r.nozzleId, businessId: dto.businessId }, data: { totalizerLitres: r.openingLitres, lastReadingAt: new Date() } });
      }
      return tx.fuelShift.findFirst({ where: { id: shift.id, businessId: dto.businessId }, include: { readings: true, attendants: true } });
    });
  }

  /**
   * Close a shift: the closing meter of every nozzle and the cash each attendant hands in. What each nozzle's
   * meter says is compared with what was rung up and tested, and each attendant's cash with the cash sales made on
   * their pumps. Both comparisons are kept on the shift as they stood at close.
   */
  async closeShift(
    id: string,
    businessId: string,
    actor: { id?: string; name: string },
    body: {
      readings?: Array<{ nozzleId?: string; pumpId?: string; closingLitres: number }>;
      attendants?: Array<{ attendantId: string; declaredCashCents: number }>;
      notes?: string;
    },
  ) {
    const shift = await this.prisma.fuelShift.findFirst({ where: { id, businessId }, include: { readings: true, attendants: true } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') throw new BadRequestException('This shift is already closed');

    const legacy = shift.readings.some((r) => !r.nozzleId);
    const closeNotes = optionalText(body?.notes, 'Notes', 500);
    const incoming = Array.isArray(body?.readings) ? body.readings : [];

    if (legacy) return this.closeLegacyShift(shift, businessId, actor, incoming, closeNotes);

    // Every nozzle on the shift must be read.
    const closing = new Map<string, number>();
    for (const r of incoming) {
      const nozzleId = text(r?.nozzleId, 'Nozzle', 64);
      const reading = shift.readings.find((x) => x.nozzleId === nozzleId);
      if (!reading) throw new BadRequestException('A closing reading names a nozzle that was not on this shift');
      if (closing.has(nozzleId)) throw new BadRequestException('Each nozzle can have only one closing reading');
      closing.set(nozzleId, numberInRange(r?.closingLitres, 'Closing reading', { min: reading.openingLitres, max: 1e9 }));
    }
    const missing = shift.readings.filter((r) => r.nozzleId && !closing.has(r.nozzleId));
    if (missing.length > 0) throw new BadRequestException(`Read every nozzle before closing: ${missing.length} still to read`);

    // Every attendant declares the cash they hand in, even if it is nothing.
    const declared = new Map<string, number>();
    for (const a of Array.isArray(body?.attendants) ? body.attendants : []) {
      const attendantId = text(a?.attendantId, 'Attendant', 64);
      if (!shift.attendants.some((x) => x.id === attendantId)) throw new BadRequestException('A cash figure names an attendant who was not on this shift');
      declared.set(attendantId, intInRange(a?.declaredCashCents, 'Cash handed in', 0, 1_000_000_000));
    }
    const undeclared = shift.attendants.filter((a) => !declared.has(a.id));
    if (undeclared.length > 0) throw new BadRequestException(`Enter the cash handed in by ${undeclared.map((a) => a.name).join(', ')}`);

    await this.prisma.$transaction(async (tx) => {
      // Claim the close. A second close, or two at once, finds the shift no longer open; and a sale in flight holds
      // the same row, so it either lands before the count below or is refused.
      const claimed = await tx.fuelShift.updateMany({
        where: { id, businessId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date(), closedBy: text(actor.name, 'Closed by', 100), closeNotes },
      });
      if (claimed.count !== 1) throw new BadRequestException('This shift is already closed');

      const [sold, tested, cashByAttendant] = await Promise.all([
        tx.fuelSale.groupBy({ by: ['nozzleId'], where: { businessId, shiftId: id, status: 'COMPLETED' }, _sum: { litresDispensed: true } }),
        tx.fuelPumpTest.groupBy({ by: ['nozzleId'], where: { businessId, shiftId: id }, _sum: { litres: true } }),
        tx.fuelSale.groupBy({ by: ['attendantId'], where: { businessId, shiftId: id, status: 'COMPLETED', paymentMethod: 'CASH' }, _sum: { totalCents: true } }),
      ]);
      const soldBy = new Map(sold.map((x) => [x.nozzleId, x._sum.litresDispensed ?? 0]));
      const testBy = new Map(tested.map((x) => [x.nozzleId, x._sum.litres ?? 0]));

      for (const reading of shift.readings) {
        const closingLitres = closing.get(reading.nozzleId as string) as number;
        const rec = reconcileNozzle({
          opening: reading.openingLitres, closing: closingLitres,
          soldLitres: soldBy.get(reading.nozzleId) ?? 0, testLitres: testBy.get(reading.nozzleId as string) ?? 0,
        });
        await tx.fuelShiftReading.updateMany({
          where: { id: reading.id, shiftId: id },
          data: { closingLitres, meterLitres: rec.meterLitres, soldLitres: rec.soldLitres, testLitres: rec.testLitres, unrecordedLitres: rec.unrecordedLitres },
        });
        await tx.fuelNozzle.updateMany({ where: { id: reading.nozzleId as string, businessId }, data: { totalizerLitres: closingLitres, lastReadingAt: new Date() } });
      }
      for (const a of shift.attendants) {
        const expected = cashByAttendant.find((c) => c.attendantId === a.id)?._sum.totalCents ?? 0;
        const handedIn = declared.get(a.id) as number;
        await tx.fuelShiftAttendant.updateMany({
          where: { id: a.id, shiftId: id },
          data: { expectedCashCents: expected, declaredCashCents: handedIn, cashVarianceCents: cashVariance(handedIn, expected), declaredAt: new Date() },
        });
      }
    });
    return this.getShiftSummary(id, businessId);
  }

  /** A shift opened before nozzles had their own meters: readings are per pump, and it closes the old way. */
  private async closeLegacyShift(
    shift: { id: string; readings: Array<{ pumpId: string; openingLitres: number }> },
    businessId: string,
    actor: { name: string },
    incoming: Array<{ pumpId?: string; closingLitres: number }>,
    closeNotes?: string,
  ) {
    const opening = new Map(shift.readings.map((r) => [r.pumpId, r.openingLitres]));
    const readings = incoming.map((r) => {
      const pumpId = text(r?.pumpId, 'Pump', 64);
      if (!opening.has(pumpId)) throw new BadRequestException('A closing reading names a pump that was not in this shift');
      return { pumpId, closingLitres: numberInRange(r?.closingLitres, 'Closing reading', { min: opening.get(pumpId) as number, max: 1e9 }) };
    });
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.fuelShift.updateMany({
        where: { id: shift.id, businessId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date(), closedBy: text(actor.name, 'Closed by', 100), closeNotes },
      });
      if (claimed.count !== 1) throw new BadRequestException('This shift is already closed');
      for (const r of readings) {
        await tx.fuelShiftReading.updateMany({ where: { shiftId: shift.id, pumpId: r.pumpId }, data: { closingLitres: r.closingLitres } });
      }
    });
    return this.getShiftSummary(shift.id, businessId);
  }

  /**
   * What happened in a shift: per nozzle (meter against sales and tests), per attendant (cash handed in against cash
   * sales), and in total. A shift still open shows where each meter should read if every litre has been rung up.
   */
  async getShiftSummary(shiftId: string, businessId: string) {
    const shift = await this.prisma.fuelShift.findFirst({ where: { id: shiftId, businessId }, include: { readings: true, attendants: true } });
    if (!shift) throw new NotFoundException('Shift not found');
    const legacy = shift.readings.some((r) => !r.nozzleId);

    const sales = await this.prisma.fuelSale.findMany({
      where: legacy
        ? { businessId, storeId: shift.storeId, status: 'COMPLETED', createdAt: { gte: shift.openedAt, ...(shift.closedAt ? { lte: shift.closedAt } : {}) } }
        : { businessId, shiftId },
      include: { pump: true, grade: true },
    });
    const done = sales.filter((s) => s.status === 'COMPLETED');
    const voided = sales.filter((s) => s.status === 'VOIDED');

    const nozzleIds = shift.readings.map((r) => r.nozzleId).filter((n): n is string => !!n);
    const [nozzles, tests] = await Promise.all([
      nozzleIds.length
        ? this.prisma.fuelNozzle.findMany({ where: { id: { in: nozzleIds }, businessId }, include: { pump: { select: { pumpNumber: true, label: true } }, grade: { select: { name: true, pricePerLitreCents: true } } } })
        : Promise.resolve([]),
      legacy ? Promise.resolve([]) : this.prisma.fuelPumpTest.findMany({ where: { businessId, shiftId } }),
    ]);
    const nozzleById = new Map(nozzles.map((n) => [n.id, n]));

    const byNozzle = shift.readings.filter((r) => r.nozzleId).map((r) => {
      const nozzle = nozzleById.get(r.nozzleId as string);
      const soldLitres = round3(done.filter((s) => s.nozzleId === r.nozzleId).reduce((t, s) => t + s.litresDispensed, 0));
      const testLitres = round3(tests.filter((t) => t.nozzleId === r.nozzleId).reduce((t, x) => t + x.litres, 0));
      const voidedLitres = round3(voided.filter((s) => s.nozzleId === r.nozzleId).reduce((t, s) => t + s.litresDispensed, 0));
      const closed = r.closingLitres !== null && r.closingLitres !== undefined;
      const rec = closed
        ? { meterLitres: r.meterLitres ?? round3((r.closingLitres as number) - r.openingLitres), soldLitres: r.soldLitres ?? soldLitres, testLitres: r.testLitres ?? testLitres, unrecordedLitres: r.unrecordedLitres ?? 0 }
        : null;
      const flag = closed ? reconcileNozzle({ opening: r.openingLitres, closing: r.closingLitres as number, soldLitres: rec!.soldLitres, testLitres: rec!.testLitres }).flag : null;
      return {
        readingId: r.id,
        nozzleId: r.nozzleId,
        attendantId: r.attendantId,
        pumpNumber: nozzle?.pump.pumpNumber ?? 0,
        pumpLabel: nozzle?.pump.label ?? null,
        nozzleNumber: nozzle?.nozzleNumber ?? 0,
        gradeName: nozzle?.grade.name ?? '',
        openingLitres: r.openingLitres,
        closingLitres: r.closingLitres ?? null,
        previousClosingLitres: r.previousClosingLitres ?? null,
        openingNote: r.openingNote ?? null,
        soldLitres: rec?.soldLitres ?? soldLitres,
        testLitres: rec?.testLitres ?? testLitres,
        voidedLitres,
        meterLitres: rec?.meterLitres ?? null,
        unrecordedLitres: rec?.unrecordedLitres ?? null,
        // Where the meter should stand now if every litre has been rung up.
        expectedClosingLitres: round3(r.openingLitres + soldLitres + testLitres),
        flag,
        unrecordedValueCents: rec && nozzle ? Math.round(rec.unrecordedLitres * nozzle.grade.pricePerLitreCents) : null,
      };
    });

    const methods = ['CASH', 'MPESA', 'CARD', 'FLEET', 'CREDIT'];
    const byAttendant = shift.attendants.map((a) => {
      const mine = done.filter((s) => s.attendantId === a.id);
      const totals: Record<string, number> = Object.fromEntries(methods.map((m) => [m, mine.filter((s) => s.paymentMethod === m).reduce((t, s) => t + s.totalCents, 0)]));
      const expectedCash = a.expectedCashCents ?? totals.CASH;
      return {
        attendantId: a.id,
        name: a.name,
        nozzleIds: a.nozzleIds,
        litres: round3(mine.reduce((t, s) => t + s.litresDispensed, 0)),
        revenueCents: mine.reduce((t, s) => t + s.totalCents, 0),
        transactions: mine.length,
        byMethod: totals,
        expectedCashCents: expectedCash,
        declaredCashCents: a.declaredCashCents ?? null,
        cashVarianceCents: a.cashVarianceCents ?? null,
      };
    });

    const byPayment = methods
      .map((m) => ({ method: m, count: done.filter((s) => s.paymentMethod === m).length, totalCents: done.filter((s) => s.paymentMethod === m).reduce((t, s) => t + s.totalCents, 0) }))
      .filter((p) => p.count > 0);

    const byPump: Record<string, { pumpId: string; pumpNumber: number; pumpLabel: string; litres: number; revenueCents: number; transactions: number; openingLitres: number; closingLitres: number | null }> = {};
    for (const s of done) {
      const row = (byPump[s.pumpId] ??= {
        pumpId: s.pumpId, pumpNumber: s.pump?.pumpNumber ?? 0, pumpLabel: s.pump?.label ?? `Pump ${s.pump?.pumpNumber}`,
        litres: 0, revenueCents: 0, transactions: 0, openingLitres: 0, closingLitres: null,
      });
      row.litres += s.litresDispensed; row.revenueCents += s.totalCents; row.transactions += 1;
    }
    if (legacy) {
      for (const r of shift.readings) {
        const row = (byPump[r.pumpId] ??= { pumpId: r.pumpId, pumpNumber: 0, pumpLabel: '', litres: 0, revenueCents: 0, transactions: 0, openingLitres: 0, closingLitres: null });
        row.openingLitres = r.openingLitres; row.closingLitres = r.closingLitres ?? null;
      }
    }

    const issues = {
      unrecordedNozzles: byNozzle.filter((n) => n.flag === 'UNRECORDED' || n.flag === 'OVER_RECORDED').length,
      cashShortAttendants: byAttendant.filter((a) => (a.cashVarianceCents ?? 0) < 0).length,
      meterGaps: byNozzle.filter((n) => n.previousClosingLitres !== null).length,
    };

    return {
      shift,
      legacy,
      totalLitres: round3(done.reduce((t, s) => t + s.litresDispensed, 0)),
      totalRevenueCents: done.reduce((t, s) => t + s.totalCents, 0),
      totalTransactions: done.length,
      voidedCount: voided.length,
      voidedLitres: round3(voided.reduce((t, s) => t + s.litresDispensed, 0)),
      byNozzle,
      byAttendant,
      byPump: Object.values(byPump),
      byPayment,
      issues,
    };
  }
}
