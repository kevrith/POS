import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { taxClassOf } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { SalesService } from '../sales/sales.service';
import { DirectSaleService, type DirectSaleInput, type DirectSaleResult } from '../sales/direct-sale.service';
import { postSettlementJournal } from '../sales/sale-ledger';
import { parseFilterDate } from '../common/dates';
import { intInRange, numberInRange, oneOf, optionalKraPin, optionalText, text } from '../common/validate';
import { marginCents } from './fuel-control';

export const FUEL_PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'FLEET', 'CREDIT'] as const;

/** No single transaction at a forecourt comes near this; a figure above it is a typo or a fiddle. */
const MAX_LITRES_PER_SALE = 5000;
/** KES 1,000 a litre. */
const MAX_PRICE_PER_LITRE_CENTS = 100_000;
const MAX_MONEY_CENTS = 1_000_000_000;
/** Statuses a person may set by hand. AUTHORIZED and DISPENSING belong to the authorize/sale flow. */
const MANUAL_PUMP_STATUSES = ['IDLE', 'OFFLINE', 'MAINTENANCE'] as const;
const MAINTENANCE_STATUSES = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const FLEET_PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;
/** How long a pump sale waits for KRA's answer so the receipt can carry the QR code. */
const ETIMS_WAIT_MS = 5000;

type OwnedModel = 'fuelGrade' | 'fuelSale' | 'fuelPump' | 'fuelTank' | 'fuelShift' | 'fleetAccount' | 'fuelPumpMaintenance' | 'fuelNozzle';

/** A pump with the hoses on it, each with its grade and the tank it draws from. */
const PUMP_INCLUDE = {
  grade: true,
  nozzles: {
    orderBy: { nozzleNumber: 'asc' as const },
    include: { grade: true, tank: { select: { id: true, tankNumber: true, label: true, currentLitres: true, gradeId: true } } },
  },
};
const MAX_NOZZLES_PER_PUMP = 12;

@Injectable()
export class FuelPumpService {
  constructor(
    private prisma: PrismaService,
    private directSales: DirectSaleService,
    private ledger: LedgerService,
    private sales: SalesService,
  ) {}

  // ── Ownership ────────────────────────────────────────────────────────────
  // Every id that arrives in a path or body is looked up WITH the caller's business, so a record that
  // belongs to someone else reads as missing. The Prisma middleware does this for single-record reads and
  // writes too; doing it here as well keeps the rule visible, and covers the findMany and updateMany
  // queries the middleware does not touch.

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

  // ── Fuel Grades ──────────────────────────────────────────────────────────

  getGrades(businessId: string, storeId: string) {
    return this.prisma.fuelGrade.findMany({
      where: { businessId, storeId },
      orderBy: { name: 'asc' },
    });
  }

  async createGrade(dto: { businessId: string; storeId: string; name: string; code: string; pricePerLitreCents: number }) {
    await this.assertStore(dto.storeId, dto.businessId);
    return this.prisma.fuelGrade.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        name: text(dto.name, 'Name', 60),
        code: text(dto.code, 'Code', 20),
        pricePerLitreCents: intInRange(dto.pricePerLitreCents, 'Price per litre', 1, MAX_PRICE_PER_LITRE_CENTS),
      },
    });
  }

  /**
   * Change a grade. A new price is checked against the regulator's cap, changes the catalogue item the grade is
   * invoiced as, and leaves a line in the price history: who, when, from what to what.
   */
  async updateGrade(
    id: string,
    businessId: string,
    dto: { name?: string; code?: string; pricePerLitreCents?: number; maxPricePerLitreCents?: number | null; isActive?: boolean; note?: string },
    changedBy = 'System',
  ) {
    const grade = await this.owned('fuelGrade', id, businessId, 'Grade');
    const newPrice = dto.pricePerLitreCents === undefined
      ? undefined
      : intInRange(dto.pricePerLitreCents, 'Price per litre', 1, MAX_PRICE_PER_LITRE_CENTS);
    const newCap = dto.maxPricePerLitreCents === undefined
      ? undefined
      : dto.maxPricePerLitreCents === null
        ? null
        : intInRange(dto.maxPricePerLitreCents, 'Price cap', 1, MAX_PRICE_PER_LITRE_CENTS);
    const capAfter = newCap === undefined ? (grade.maxPricePerLitreCents ?? null) : newCap;
    const priceAfter = newPrice ?? grade.pricePerLitreCents;
    if (capAfter !== null && priceAfter > capAfter) {
      throw new BadRequestException(
        `That price is above the cap of KES ${(capAfter / 100).toFixed(2)} a litre. Raise the cap only if the regulator has.`,
      );
    }
    const priceChanged = newPrice !== undefined && newPrice !== grade.pricePerLitreCents;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.fuelGrade.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: text(dto.name, 'Name', 60) }),
          ...(dto.code !== undefined && { code: text(dto.code, 'Code', 20) }),
          ...(newPrice !== undefined && { pricePerLitreCents: newPrice }),
          ...(newCap !== undefined && { maxPricePerLitreCents: newCap }),
          ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
        },
      });
      if (priceChanged) {
        await tx.fuelPriceChange.create({
          data: {
            businessId,
            gradeId: id,
            oldPriceCents: grade.pricePerLitreCents,
            newPriceCents: newPrice as number,
            changedBy: text(changedBy, 'Changed by', 100),
            note: optionalText(dto.note, 'Note', 200),
          },
        });
      }
      return row;
    });
    // The catalogue item the grade is invoiced as follows its price.
    if (grade.itemId && priceChanged) {
      await this.prisma.item.updateMany({ where: { id: grade.itemId, businessId }, data: { retailPriceCents: updated.pricePerLitreCents } });
    }
    return updated;
  }

  async getPriceHistory(businessId: string, gradeId: string) {
    await this.owned('fuelGrade', gradeId, businessId, 'Grade');
    return this.prisma.fuelPriceChange.findMany({ where: { gradeId, businessId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /**
   * The catalogue item a grade is invoiced as: eTIMS wants an item, a tax class and a name on every line. Made on
   * the first sale after cutover, inactive so it stays off the tills, and standard-rated until the owner classifies
   * it in Inventory.
   */
  private async ensureGradeItem(
    tx: { item: any; fuelGrade: any },
    grade: { id: string; businessId: string; storeId: string; name: string; pricePerLitreCents: number; itemId?: string | null },
  ) {
    if (grade.itemId) {
      const existing = await tx.item.findFirst({ where: { id: grade.itemId, businessId: grade.businessId } });
      if (existing) return existing;
    }
    const item = await tx.item.create({
      data: {
        offlineId: uuidv4(),
        businessId: grade.businessId,
        storeId: grade.storeId,
        name: `${grade.name} (fuel, per litre)`,
        category: 'Fuel',
        type: 'PRODUCT',
        retailPriceCents: grade.pricePerLitreCents,
        trackStock: false,
        isActive: false,
        unitLabel: 'L',
        taxClass: 'B',
        vatApplicable: true,
      },
    });
    await tx.fuelGrade.update({ where: { id: grade.id }, data: { itemId: item.id } });
    return item;
  }

  // ── Pumps and nozzles ──────────────────────────────────────────────────────

  getPumps(businessId: string, storeId: string) {
    return this.prisma.fuelPump.findMany({
      where: { businessId, storeId },
      include: PUMP_INCLUDE,
      orderBy: { pumpNumber: 'asc' },
    });
  }

  /** The tank a new nozzle draws from: the one asked for (it must hold that grade), else the grade's first active tank. */
  private async tankForNozzle(businessId: string, storeId: string, gradeId: string, tankId?: string | null) {
    if (tankId) {
      const tank = await this.owned('fuelTank', tankId, businessId, 'Tank');
      if (tank.storeId !== storeId) throw new BadRequestException('That tank belongs to a different store');
      if (tank.gradeId !== gradeId) throw new BadRequestException('That tank holds a different grade');
      return tank.id as string;
    }
    const first = await this.prisma.fuelTank.findFirst({ where: { businessId, storeId, gradeId, isActive: true }, orderBy: { tankNumber: 'asc' } });
    return (first?.id as string | undefined) ?? null;
  }

  /**
   * A dispenser and its hoses. Send `nozzles` (each with its grade and, if you like, its tank) for a pump that
   * sells more than one grade; send only `gradeId` and `nozzleCount` for a plain one-grade pump.
   */
  async createPump(dto: {
    businessId: string; storeId: string; pumpNumber: number; label?: string; gradeId?: string; nozzleCount?: number;
    nozzles?: Array<{ gradeId?: string; tankId?: string | null }>;
  }) {
    await this.assertStore(dto.storeId, dto.businessId);
    const pumpNumber = intInRange(dto.pumpNumber, 'Pump number', 1, 999);
    const specs = Array.isArray(dto.nozzles) && dto.nozzles.length > 0
      ? dto.nozzles
      : Array.from({ length: dto.nozzleCount === undefined ? 1 : intInRange(dto.nozzleCount, 'Nozzles', 1, MAX_NOZZLES_PER_PUMP) }, () => ({ gradeId: dto.gradeId, tankId: null as string | null }));
    if (specs.length > MAX_NOZZLES_PER_PUMP) throw new BadRequestException(`A pump has at most ${MAX_NOZZLES_PER_PUMP} nozzles`);

    const resolved: Array<{ gradeId: string; tankId: string | null }> = [];
    for (const spec of specs) {
      const gradeId = spec.gradeId ?? dto.gradeId;
      const grade = await this.owned('fuelGrade', gradeId, dto.businessId, 'Grade');
      if (grade.storeId !== dto.storeId) throw new BadRequestException('That grade belongs to a different store');
      resolved.push({ gradeId: grade.id, tankId: await this.tankForNozzle(dto.businessId, dto.storeId, grade.id, spec.tankId) });
    }

    const clash = await this.prisma.fuelPump.findFirst({ where: { businessId: dto.businessId, storeId: dto.storeId, pumpNumber } });
    if (clash) throw new BadRequestException(`Pump ${pumpNumber} already exists`);
    return this.prisma.fuelPump.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        pumpNumber,
        label: optionalText(dto.label, 'Label', 60),
        gradeId: resolved[0].gradeId,
        nozzleCount: resolved.length,
        nozzles: {
          create: resolved.map((r, k) => ({ businessId: dto.businessId, storeId: dto.storeId, nozzleNumber: k + 1, gradeId: r.gradeId, tankId: r.tankId })),
        },
      },
      include: PUMP_INCLUDE,
    });
  }

  /** A pump's grade lives on its nozzles now, so only its label and status change here. */
  async updatePump(id: string, businessId: string, dto: { label?: string; status?: string }) {
    await this.owned('fuelPump', id, businessId, 'Pump');
    return this.prisma.fuelPump.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: optionalText(dto.label, 'Label', 60) ?? null }),
        ...(dto.status !== undefined && { status: oneOf(dto.status, 'Status', MANUAL_PUMP_STATUSES) }),
      },
      include: PUMP_INCLUDE,
    });
  }

  /** Is this nozzle on a shift that is still open? Its grade, tank and meter must not move under that shift. */
  private async inOpenShift(nozzleId: string, businessId: string) {
    const reading = await this.prisma.fuelShiftReading.findFirst({ where: { nozzleId, shift: { businessId, status: 'OPEN' } } });
    return !!reading;
  }

  async addNozzle(pumpId: string, businessId: string, dto: { gradeId?: string; tankId?: string | null }) {
    const pump = await this.owned('fuelPump', pumpId, businessId, 'Pump');
    const grade = await this.owned('fuelGrade', dto.gradeId ?? pump.gradeId, businessId, 'Grade');
    if (grade.storeId !== pump.storeId) throw new BadRequestException('That grade belongs to a different store');
    const existing = await this.prisma.fuelNozzle.findMany({ where: { pumpId, businessId }, select: { nozzleNumber: true } });
    if (existing.length >= MAX_NOZZLES_PER_PUMP) throw new BadRequestException(`A pump has at most ${MAX_NOZZLES_PER_PUMP} nozzles`);
    const nozzleNumber = existing.reduce((m, n) => Math.max(m, n.nozzleNumber), 0) + 1;
    const tankId = await this.tankForNozzle(businessId, pump.storeId, grade.id, dto.tankId);
    const nozzle = await this.prisma.fuelNozzle.create({
      data: { businessId, storeId: pump.storeId, pumpId, nozzleNumber, gradeId: grade.id, tankId },
      include: { grade: true },
    });
    await this.prisma.fuelPump.update({ where: { id: pumpId }, data: { nozzleCount: existing.length + 1 } });
    return nozzle;
  }

  async updateNozzle(id: string, businessId: string, dto: { gradeId?: string; tankId?: string | null; isActive?: boolean }) {
    const nozzle = await this.owned('fuelNozzle', id, businessId, 'Nozzle');
    const changesRouting = dto.gradeId !== undefined || dto.tankId !== undefined || dto.isActive === false;
    if (changesRouting && (await this.inOpenShift(id, businessId))) {
      throw new BadRequestException('This nozzle is on the open shift. Close the shift before changing its grade, tank or status.');
    }
    const gradeId = dto.gradeId ?? nozzle.gradeId;
    if (dto.gradeId !== undefined) {
      const grade = await this.owned('fuelGrade', dto.gradeId, businessId, 'Grade');
      if (grade.storeId !== nozzle.storeId) throw new BadRequestException('That grade belongs to a different store');
    }
    let tankId: string | null | undefined;
    if (dto.tankId !== undefined) {
      tankId = dto.tankId === null ? null : await this.tankForNozzle(businessId, nozzle.storeId, gradeId, dto.tankId);
    } else if (dto.gradeId !== undefined && dto.gradeId !== nozzle.gradeId) {
      // A different grade needs a tank that holds it.
      tankId = await this.tankForNozzle(businessId, nozzle.storeId, gradeId, null);
    }
    return this.prisma.fuelNozzle.update({
      where: { id },
      data: {
        ...(dto.gradeId !== undefined && { gradeId: dto.gradeId }),
        ...(tankId !== undefined && { tankId }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
      },
      include: { grade: true },
    });
  }

  async authorizePump(id: string, businessId: string) {
    const pump = await this.owned('fuelPump', id, businessId, 'Pump');
    if (pump.status !== 'IDLE') throw new BadRequestException(`Pump is ${pump.status}`);

    // Block when every tank this pump draws from is empty.
    const nozzles = await this.prisma.fuelNozzle.findMany({ where: { pumpId: id, businessId, isActive: true }, include: { tank: true, grade: true } });
    const tracked = nozzles.filter((n) => n.tank && n.tank.isActive);
    if (tracked.length > 0 && tracked.every((n) => (n.tank as { currentLitres: number }).currentLitres <= 0)) {
      throw new BadRequestException(`Tank for ${tracked[0].grade?.name ?? 'this grade'} is empty. Cannot authorize pump.`);
    }

    // Claim the pump only if it is still idle: two attendants pressing Authorize cannot both win.
    const claimed = await this.prisma.fuelPump.updateMany({ where: { id, businessId, status: 'IDLE' }, data: { status: 'AUTHORIZED' } });
    if (claimed.count !== 1) throw new BadRequestException('Pump was just authorized by someone else');
    return this.prisma.fuelPump.findFirst({ where: { id, businessId }, include: PUMP_INCLUDE });
  }

  async stopPump(id: string, businessId: string) {
    await this.owned('fuelPump', id, businessId, 'Pump');
    return this.prisma.fuelPump.update({ where: { id }, data: { status: 'IDLE' }, include: PUMP_INCLUDE });
  }

  // ── Fuel Sales ────────────────────────────────────────────────────────────

  getSales(businessId: string, storeId: string, filters: { pumpId?: string; startDate?: string; endDate?: string }) {
    return this.prisma.fuelSale.findMany({
      where: {
        businessId,
        storeId,
        ...(filters.pumpId ? { pumpId: filters.pumpId } : {}),
        ...(filters.startDate || filters.endDate
          ? {
              createdAt: {
                ...(filters.startDate ? { gte: parseFilterDate(filters.startDate, 'start', 'Start date') } : {}),
                ...(filters.endDate ? { lte: parseFilterDate(filters.endDate, 'end', 'End date') } : {}),
              },
            }
          : {}),
      },
      include: { pump: true, grade: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Record fuel that has been dispensed. Everything that must agree happens in ONE transaction: the tank
   * draw, the fleet charge, the sale and the pump reset either all commit or none do. The price is the
   * grade's own, never the one in the request, and the tank and fleet balance are changed with
   * conditional updates, so two sales at once cannot both spend the same litres or the same credit.
   */
  async recordSale(dto: {
    businessId: string;
    storeId?: string;
    pumpId: string;
    nozzleId?: string;
    gradeId?: string;
    cashierId?: string;
    customerId?: string;
    vehiclePlate?: string;
    litresDispensed: number;
    pricePerLitreCents?: number;
    paymentMethod: string;
    paymentRef?: string;
    fleetAccountId?: string;
  }) {
    const litres = numberInRange(dto.litresDispensed, 'Litres dispensed', { min: 0, max: MAX_LITRES_PER_SALE, exclusiveMin: true });
    const paymentMethod = oneOf(String(dto.paymentMethod ?? '').toUpperCase(), 'Payment method', FUEL_PAYMENT_METHODS);
    if (paymentMethod === 'FLEET' && !dto.fleetAccountId) throw new BadRequestException('Choose the fleet account to charge');
    // Credit is for a registered customer who can be billed. Anonymous credit is a debt nobody can chase.
    const customerId = optionalText(dto.customerId, 'Customer', 64);
    if (paymentMethod === 'CREDIT') {
      if (!customerId) throw new BadRequestException('A credit sale needs a registered customer');
      const known = await this.prisma.customer.count({ where: { id: customerId, businessId: dto.businessId } });
      if (!known) throw new BadRequestException('Customer not found');
    }

    const pump = await this.prisma.fuelPump.findFirst({
      where: { id: dto.pumpId, businessId: dto.businessId },
      include: { nozzles: { where: { isActive: true }, orderBy: { nozzleNumber: 'asc' }, include: { grade: true } } },
    });
    if (!pump) throw new NotFoundException('Pump not found');

    // Which hose the fuel came out of: it sets the grade, the price and the tank.
    const hoses = pump.nozzles ?? [];
    let nozzle: (typeof hoses)[number] | undefined;
    if (dto.nozzleId) {
      nozzle = hoses.find((n) => n.id === dto.nozzleId);
      if (!nozzle) throw new BadRequestException('That nozzle is not on this pump');
    } else if (hoses.length === 1) {
      nozzle = hoses[0];
    } else if (hoses.length === 0) {
      throw new BadRequestException('This pump has no active nozzle');
    } else {
      throw new BadRequestException('Choose the nozzle the fuel came from');
    }
    const grade = nozzle.grade;
    if (dto.gradeId && dto.gradeId !== nozzle.gradeId) throw new BadRequestException('This pump dispenses a different grade');
    if (!grade?.isActive) throw new BadRequestException('This grade is switched off');

    // Fuel is only sold inside a shift, on a nozzle that was read when the shift opened, so every litre has an attendant.
    const shift = await this.prisma.fuelShift.findFirst({
      where: { businessId: dto.businessId, storeId: pump.storeId, status: 'OPEN' },
      include: { readings: true, attendants: true },
    });
    if (!shift) throw new BadRequestException('No shift is open. Open a shift before selling fuel.');
    if (!shift.readings.some((r) => r.nozzleId === nozzle.id)) {
      throw new BadRequestException(
        shift.readings.some((r) => !r.nozzleId)
          ? 'This shift was opened before each nozzle had its own meter. Close it and open a new shift.'
          : `Pump ${pump.pumpNumber} nozzle ${nozzle.nozzleNumber} is not on the open shift. Close the shift and open one that includes it.`,
      );
    }
    const attendant = shift.attendants.find((a) => a.nozzleIds.includes(nozzle.id));

    const pricePerLitreCents = grade.pricePerLitreCents;
    const totalCents = Math.round(litres * pricePerLitreCents);
    const businessId = dto.businessId;
    // Past the business's cutover, the sale also becomes a real Sale: receipt, eTIMS, Z-report, drawer, ledger.
    const invoice = await this.directSales.isEnabled(businessId);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // 0. The shift must still be open at the moment the sale is written: closing it takes the same row, so a
      //    sale either lands before the close counts the shift or is refused.
      const stillOpen = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "FuelShift" WHERE "id" = ${shift.id} AND "status" = 'OPEN' FOR SHARE`;
      if (stillOpen.length !== 1) throw new BadRequestException('The shift was just closed. Open a new shift to sell fuel.');

      // 1. Take the fuel out of the tank this hose is plumbed to (or, for a hose with no tank set, any tank of the
      //    grade that can cover it). A grade with no tank at all is not stock-tracked and sells as before.
      const tanks = nozzle.tankId
        ? await tx.fuelTank.findMany({ where: { id: nozzle.tankId, businessId, isActive: true } })
        : await tx.fuelTank.findMany({
            where: { gradeId: nozzle.gradeId, businessId, storeId: pump.storeId, isActive: true },
            orderBy: { tankNumber: 'asc' },
          });
      if (nozzle.tankId && tanks.length === 0) {
        throw new BadRequestException(`The tank for pump ${pump.pumpNumber} nozzle ${nozzle.nozzleNumber} is switched off. Choose another tank for the nozzle first.`);
      }
      let drawnFrom: string | null = null;
      let unitCostCents: number | null = null;
      if (tanks.length > 0) {
        let drawn = false;
        for (const tank of tanks) {
          const taken = await tx.fuelTank.updateMany({
            where: { id: tank.id, currentLitres: { gte: litres } },
            data: { currentLitres: { decrement: litres } },
          });
          if (taken.count === 1) {
            drawn = true;
            drawnFrom = tank.id;
            unitCostCents = tank.avgCostCents > 0 ? Math.round(tank.avgCostCents) : null;
            break;
          }
        }
        if (!drawn) {
          const most = Math.max(...tanks.map((t) => t.currentLitres));
          throw new BadRequestException(
            `Insufficient fuel in tank. Available: ${most.toFixed(2)}L, Requested: ${litres.toFixed(2)}L`,
          );
        }
      }

      // 2. The sale itself.
      const sale = await tx.fuelSale.create({
        data: {
          businessId,
          storeId: pump.storeId,
          pumpId: pump.id,
          gradeId: nozzle.gradeId,
          nozzleId: nozzle.id,
          shiftId: shift.id,
          attendantId: attendant?.id,
          attendantName: attendant?.name,
          unitCostCents,
          cashierId: dto.cashierId,
          customerId,
          vehiclePlate: optionalText(dto.vehiclePlate, 'Vehicle plate', 20)?.toUpperCase(),
          litresDispensed: litres,
          pricePerLitreCents,
          totalCents,
          tankId: drawnFrom,
          paymentMethod,
          paymentRef: optionalText(dto.paymentRef, 'Payment reference', 100),
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: { pump: true, grade: true },
      });

      // 3. A fleet sale charges the account inside the same transaction. If the limit is hit the whole
      //    sale rolls back, tank draw included.
      let fleet: { companyName: string; kraPin: string | null } | null = null;
      if (paymentMethod === 'FLEET') {
        fleet = await tx.fleetAccount.findFirst({ where: { id: dto.fleetAccountId as string, businessId }, select: { companyName: true, kraPin: true } });
        if (!fleet) throw new NotFoundException('Fleet account not found');
        await this.chargeFleet(tx, dto.fleetAccountId as string, businessId, totalCents, sale.id, `Fuel: ${litres.toFixed(2)}L`);
        // The invoice puts this in receivables, so the books now believe the account owes it.
        if (invoice) await this.adjustLedgerOwed(tx, dto.fleetAccountId as string, businessId, totalCents);
      }

      // 4. The invoice, in the same transaction: if it cannot be written, nothing above is kept.
      let direct: { result: DirectSaleResult; input: DirectSaleInput } | null = null;
      if (invoice) {
        const gradeItem = await this.ensureGradeItem(tx, grade);
        const onAccount = paymentMethod === 'FLEET' || paymentMethod === 'CREDIT';
        const input: DirectSaleInput = {
          businessId,
          storeId: pump.storeId,
          cashierId: dto.cashierId,
          source: 'FUEL',
          lines: [{
            itemId: gradeItem.id,
            name: `${grade.name} (Pump ${pump.pumpNumber})`,
            quantity: litres,
            unitPriceCents: pricePerLitreCents,
            totalCents,
            taxClass: taxClassOf(gradeItem),
          }],
          payments: onAccount ? [] : [{ method: paymentMethod, amountCents: totalCents, reference: dto.paymentRef }],
          onAccount,
          customerId: paymentMethod === 'CREDIT' ? customerId : undefined,
          externalAccount: paymentMethod === 'FLEET',
          customerName: fleet?.companyName,
          buyerKraPin: fleet?.kraPin ?? undefined,
          notes: `Fuel ${litres.toFixed(3)} L, pump ${pump.pumpNumber}${sale.vehiclePlate ? `, ${sale.vehiclePlate}` : ''}`,
        };
        const result = await this.directSales.createInTx(tx, input);
        // updateMany, not update: the tenant middleware checks an `update` by id against rows outside this
        // transaction, so it cannot see the FuelSale created a moment ago and reports it missing.
        await tx.fuelSale.updateMany({ where: { id: sale.id, businessId }, data: { saleId: result.sale.id } });
        direct = { result, input };
      }

      // 5. The pump is free again.
      await tx.fuelPump.update({ where: { id: pump.id }, data: { status: 'IDLE' } });
      return { sale, direct };
    });

    // Books, KRA and the broadcast follow the commit, and cannot undo it. The pump screen wants the KRA QR code for
    // the receipt, so wait for it briefly; if KRA is slow the sale is already safe and the receipt prints without it.
    let etims: unknown = null;
    if (outcome.direct) {
      const after = this.directSales.afterCommit(outcome.direct.result, outcome.direct.input);
      let timer: ReturnType<typeof setTimeout> | undefined;
      etims = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
      clearTimeout(timer);
    }
    return {
      ...outcome.sale,
      ...(outcome.direct && {
        saleId: outcome.direct.result.sale.id,
        receiptNumber: outcome.direct.result.sale.receiptNumber,
        invoice: outcome.direct.result.sale,
        etims,
      }),
    };
  }

  /**
   * Take a pump sale back (a wrong pump, a drive-off that was rung up, a keying mistake). A manager's decision. In one
   * transaction the sale is marked voided, the litres go back into the tank they came from, a fleet sale credits the
   * fleet account, and, when the sale was invoiced, the invoice is voided with it (stock-free, so that is the receipt,
   * the books and KRA's credit note). Cash comes back out of the drawer's expected cash on its own, because the
   * sale no longer counts.
   */
  async voidSale(id: string, businessId: string, actor: { id: string; name: string; role: string }, reason: unknown) {
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)) throw new ForbiddenException('Only a manager can void a pump sale');
    const why = text(reason, 'Reason', 200);
    const found = await this.owned('fuelSale', id, businessId, 'Sale');
    if (found.status === 'VOIDED') throw new BadRequestException('This sale was already voided');
    if (found.status !== 'COMPLETED') throw new BadRequestException('Only a completed sale can be voided');

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Claim it first, so a second manager (or a double click) finds it already gone.
      const claimed = await tx.fuelSale.updateMany({
        where: { id, businessId, status: 'COMPLETED' },
        data: { status: 'VOIDED', voidedAt: new Date(), voidedBy: actor.name, voidReason: why },
      });
      if (claimed.count !== 1) throw new BadRequestException('This sale was already voided');

      // The litres go back where they were drawn. A sale from before that was kept goes to the first tank of the
      // grade that has room, since there is no way to know.
      const litres = found.litresDispensed;
      let tankId: string | null = found.tankId ?? null;
      if (!tankId) {
        const tanks = await tx.fuelTank.findMany({ where: { gradeId: found.gradeId, businessId, storeId: found.storeId, isActive: true }, orderBy: { tankNumber: 'asc' } });
        tankId = (tanks.find((t) => t.currentLitres + litres <= t.capacityLitres) ?? tanks[0])?.id ?? null;
      }
      if (tankId) await tx.fuelTank.updateMany({ where: { id: tankId, businessId }, data: { currentLitres: { increment: litres } } });

      // A fleet sale charged the account: give it back.
      if (found.paymentMethod === 'FLEET') {
        const charge = await tx.fleetTransaction.findFirst({ where: { fuelSaleId: id, businessId, type: 'CHARGE' } });
        if (charge) {
          await tx.fleetAccount.updateMany({ where: { id: charge.fleetAccountId, businessId }, data: { balanceCents: { increment: charge.amountCents } } });
          // The invoice's receivable is reversed with the sale, so the books believe less is owed.
          if (found.saleId) await this.adjustLedgerOwed(tx, charge.fleetAccountId, businessId, -charge.amountCents);
          await tx.fleetTransaction.create({
            data: { fleetAccountId: charge.fleetAccountId, businessId, type: 'VOID', amountCents: charge.amountCents, fuelSaleId: id, description: `Voided fuel sale: ${why}` },
          });
        }
      }

      const voided = found.saleId
        ? await this.sales.voidInTx(tx, found.saleId, businessId, actor.id, `Fuel sale voided: ${why}`)
        : null;
      return { voided };
    });

    if (outcome.voided && found.saleId) await this.sales.afterVoid(found.saleId, businessId, actor.id, `Fuel sale voided: ${why}`, outcome.voided);
    return { success: true, refundAmountCents: found.totalCents, saleId: found.saleId };
  }

  /**
   * What the books believe a fleet account owes, kept in step with what is posted to receivables. When the sales
   * pipeline is switched off and on again, the difference from the real balance is what gets booked as an opening
   * balance. Never below zero: an account that overpays is a credit, not a negative debt.
   */
  private async adjustLedgerOwed(tx: { $executeRaw: (...a: any[]) => Promise<number> }, fleetAccountId: string, businessId: string, deltaCents: number) {
    await tx.$executeRaw`UPDATE "FleetAccount" SET "ledgerOwedCents" = GREATEST(0, "ledgerOwedCents" + ${deltaCents}) WHERE "id" = ${fleetAccountId} AND "businessId" = ${businessId}`;
  }

  /** Debit a fleet account without ever passing its credit limit, however many sales run at once. */
  private async chargeFleet(
    tx: { $executeRaw: (...a: any[]) => Promise<number>; fleetAccount: any; fleetTransaction: any },
    fleetAccountId: string,
    businessId: string,
    amountCents: number,
    fuelSaleId: string,
    description: string,
  ) {
    // creditLimitCents <= 0 means no limit has been set for the account.
    const changed = await tx.$executeRaw`
      UPDATE "FleetAccount"
      SET "balanceCents" = "balanceCents" - ${amountCents}, "updatedAt" = NOW()
      WHERE "id" = ${fleetAccountId} AND "businessId" = ${businessId} AND "isActive" = true
        AND ("creditLimitCents" <= 0 OR "balanceCents" - ${amountCents} >= -"creditLimitCents")`;
    if (changed !== 1) {
      const account = await tx.fleetAccount.findFirst({ where: { id: fleetAccountId, businessId } });
      if (!account) throw new NotFoundException('Fleet account not found');
      if (!account.isActive) throw new BadRequestException('This fleet account is switched off');
      throw new BadRequestException(
        `Credit limit exceeded. Limit: KES ${(account.creditLimitCents / 100).toFixed(2)}, ` +
        `balance: KES ${(account.balanceCents / 100).toFixed(2)}, this sale: KES ${(amountCents / 100).toFixed(2)}.`,
      );
    }
    await tx.fleetTransaction.create({
      data: { fleetAccountId, businessId, type: 'CHARGE', amountCents, fuelSaleId, description },
    });
  }

  async getSaleStats(businessId: string, storeId: string, startDate?: string, endDate?: string) {
    const where = {
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

    const [totals, byGrade, byCost, byPayment] = await Promise.all([
      this.prisma.fuelSale.aggregate({ where, _sum: { totalCents: true, litresDispensed: true }, _count: true }),
      this.prisma.fuelSale.groupBy({ by: ['gradeId'], where, _sum: { totalCents: true, litresDispensed: true }, _count: true }),
      // A handful of rows: one per grade per distinct cost, so margin is exact without reading every sale.
      this.prisma.fuelSale.groupBy({ by: ['gradeId', 'unitCostCents'], where, _sum: { totalCents: true, litresDispensed: true } }),
      this.prisma.fuelSale.groupBy({ by: ['paymentMethod'], where, _sum: { totalCents: true, litresDispensed: true }, _count: true }),
    ]);

    const grades = await this.prisma.fuelGrade.findMany({ where: { businessId, storeId } });
    const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g.name]));

    // Margin counts only the fuel whose cost was known; the rest is reported so the figure is not mistaken for all of it.
    const margin: Record<string, { marginCents: number; costedRevenueCents: number; uncostedRevenueCents: number }> = {};
    for (const row of byCost) {
      const m = (margin[row.gradeId] ??= { marginCents: 0, costedRevenueCents: 0, uncostedRevenueCents: 0 });
      const revenue = row._sum.totalCents ?? 0;
      const gained = marginCents(revenue, row._sum.litresDispensed ?? 0, row.unitCostCents);
      if (gained === null) m.uncostedRevenueCents += revenue;
      else { m.marginCents += gained; m.costedRevenueCents += revenue; }
    }
    const sum = (k: 'marginCents' | 'costedRevenueCents' | 'uncostedRevenueCents') => Object.values(margin).reduce((t, m) => t + m[k], 0);

    return {
      totalRevenueCents: totals._sum.totalCents ?? 0,
      totalLitres: totals._sum.litresDispensed ?? 0,
      totalTransactions: totals._count,
      marginCents: sum('marginCents'),
      costedRevenueCents: sum('costedRevenueCents'),
      uncostedRevenueCents: sum('uncostedRevenueCents'),
      byGrade: byGrade.map((g) => ({
        gradeId: g.gradeId,
        gradeName: gradeMap[g.gradeId] ?? g.gradeId,
        revenueCents: g._sum.totalCents ?? 0,
        litres: g._sum.litresDispensed ?? 0,
        transactions: g._count,
        marginCents: margin[g.gradeId]?.marginCents ?? 0,
        costedRevenueCents: margin[g.gradeId]?.costedRevenueCents ?? 0,
      })),
      byPayment: byPayment.map((p) => ({
        method: p.paymentMethod,
        revenueCents: p._sum.totalCents ?? 0,
        litres: p._sum.litresDispensed ?? 0,
        transactions: p._count,
      })),
    };
  }

  // ── Tank Management ────────────────────────────────────────────────────────

  getTanks(businessId: string, storeId: string) {
    return this.prisma.fuelTank.findMany({
      where: { businessId, storeId, isActive: true },
      include: { grade: true, dippings: { orderBy: { recordedAt: 'desc' }, take: 1 } },
      orderBy: { tankNumber: 'asc' },
    });
  }

  async createTank(dto: { businessId: string; storeId: string; tankNumber: number; label?: string; gradeId: string; capacityLitres: number; minLevelLitres?: number }) {
    await this.assertStore(dto.storeId, dto.businessId);
    const grade = await this.owned('fuelGrade', dto.gradeId, dto.businessId, 'Grade');
    if (grade.storeId !== dto.storeId) throw new BadRequestException('That grade belongs to a different store');
    const capacityLitres = numberInRange(dto.capacityLitres, 'Capacity', { min: 0, max: 1_000_000, exclusiveMin: true });
    const minLevelLitres = dto.minLevelLitres === undefined ? undefined : numberInRange(dto.minLevelLitres, 'Minimum level', { min: 0, max: capacityLitres });
    return this.prisma.fuelTank.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        tankNumber: intInRange(dto.tankNumber, 'Tank number', 1, 999),
        label: optionalText(dto.label, 'Label', 60),
        gradeId: dto.gradeId,
        capacityLitres,
        ...(minLevelLitres !== undefined && { minLevelLitres }),
      },
      include: { grade: true },
    });
  }

  /** The tank's current level is never set here: it moves only through sales, deliveries and dippings. */
  async updateTank(id: string, businessId: string, dto: { label?: string; capacityLitres?: number; minLevelLitres?: number; isActive?: boolean }) {
    await this.owned('fuelTank', id, businessId, 'Tank');
    return this.prisma.fuelTank.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: optionalText(dto.label, 'Label', 60) ?? null }),
        ...(dto.capacityLitres !== undefined && { capacityLitres: numberInRange(dto.capacityLitres, 'Capacity', { min: 0, max: 1_000_000, exclusiveMin: true }) }),
        ...(dto.minLevelLitres !== undefined && { minLevelLitres: numberInRange(dto.minLevelLitres, 'Minimum level', { min: 0, max: 1_000_000 }) }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
      },
      include: { grade: true },
    });
  }

  // ── Fleet Accounts ─────────────────────────────────────────────────────────

  getFleetAccounts(businessId: string) {
    return this.prisma.fleetAccount.findMany({
      where: { businessId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { companyName: 'asc' },
    });
  }

  async createFleetAccount(dto: {
    businessId: string;
    companyName: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    creditLimitCents: number;
  }) {
    return this.prisma.fleetAccount.create({
      data: {
        businessId: dto.businessId,
        companyName: text(dto.companyName, 'Company name', 120),
        contactName: optionalText(dto.contactName, 'Contact name', 100),
        contactPhone: optionalText(dto.contactPhone, 'Contact phone', 30),
        contactEmail: optionalText(dto.contactEmail, 'Contact email', 120),
        kraPin: optionalKraPin((dto as { kraPin?: string }).kraPin),
        creditLimitCents: intInRange(dto.creditLimitCents ?? 0, 'Credit limit', 0, MAX_MONEY_CENTS),
      },
    });
  }

  /** Never edits the balance: that moves only through charges and payments. */
  async updateFleetAccount(
    id: string,
    businessId: string,
    dto: { companyName?: string; contactName?: string; contactPhone?: string; contactEmail?: string; kraPin?: string; creditLimitCents?: number; isActive?: boolean },
  ) {
    await this.owned('fleetAccount', id, businessId, 'Fleet account');
    return this.prisma.fleetAccount.update({
      where: { id },
      data: {
        ...(dto.companyName !== undefined && { companyName: text(dto.companyName, 'Company name', 120) }),
        ...(dto.contactName !== undefined && { contactName: optionalText(dto.contactName, 'Contact name', 100) ?? null }),
        ...(dto.contactPhone !== undefined && { contactPhone: optionalText(dto.contactPhone, 'Contact phone', 30) ?? null }),
        ...(dto.contactEmail !== undefined && { contactEmail: optionalText(dto.contactEmail, 'Contact email', 120) ?? null }),
        ...(dto.kraPin !== undefined && { kraPin: optionalKraPin(dto.kraPin) ?? null }),
        ...(dto.creditLimitCents !== undefined && { creditLimitCents: intInRange(dto.creditLimitCents, 'Credit limit', 0, MAX_MONEY_CENTS) }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
      },
    });
  }

  async getFleetTransactions(businessId: string, fleetAccountId: string) {
    await this.owned('fleetAccount', fleetAccountId, businessId, 'Fleet account');
    return this.prisma.fleetTransaction.findMany({
      where: { fleetAccountId, businessId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * A fleet company paying down its account. Past the cutover the receipt is also posted to the books (money in,
   * receivable cleared), because fleet sales are posted as receivables and would never clear otherwise.
   */
  async recordFleetPayment(dto: {
    businessId: string;
    fleetAccountId: string;
    amountCents: number;
    method?: string;
    reference?: string;
    description?: string;
  }) {
    const amountCents = intInRange(dto.amountCents, 'Payment amount', 1, MAX_MONEY_CENTS);
    const method = oneOf(String(dto.method ?? 'CASH').toUpperCase(), 'Payment method', FLEET_PAYMENT_METHODS);
    const account = await this.owned('fleetAccount', dto.fleetAccountId, dto.businessId, 'Fleet account');
    const reference = optionalText(dto.reference, 'Reference', 100);
    const inBooks = await this.directSales.isEnabled(dto.businessId);
    const [tx] = await this.prisma.$transaction([
      this.prisma.fleetTransaction.create({
        data: {
          fleetAccountId: account.id,
          businessId: dto.businessId,
          type: 'PAYMENT',
          amountCents,
          reference,
          description: optionalText(dto.description, 'Description', 200) ?? `Payment received (${method})`,
        },
      }),
      this.prisma.fleetAccount.update({
        where: { id: account.id },
        data: { balanceCents: { increment: amountCents } },
      }),
      // The payment is posted to the books only on the pipeline, so only then does what they believe is owed fall.
      ...(inBooks
        ? [this.prisma.$executeRaw`UPDATE "FleetAccount" SET "ledgerOwedCents" = GREATEST(0, "ledgerOwedCents" - ${amountCents}) WHERE "id" = ${account.id} AND "businessId" = ${dto.businessId}`]
        : []),
    ]);

    if (inBooks) {
      void postSettlementJournal(this.ledger, {
        businessId: dto.businessId,
        description: `Fleet payment: ${account.companyName}`,
        reference: reference ?? `FLEET-${tx.id.slice(0, 8)}`,
        sourceType: 'FLEET_PAYMENT',
        method,
        amountCents,
      }).catch(() => undefined);
    }
    return tx;
  }

  // ── Maintenance Log ────────────────────────────────────────────────────────

  getMaintenanceLogs(businessId: string, pumpId?: string) {
    return this.prisma.fuelPumpMaintenance.findMany({
      where: { businessId, ...(pumpId ? { pumpId } : {}) },
      include: { pump: { select: { pumpNumber: true, label: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async createMaintenanceLog(dto: {
    businessId: string;
    pumpId: string;
    type: string;
    description: string;
    technicianName?: string;
    costCents?: number;
    status?: string;
    startedAt?: string;
    completedAt?: string;
    notes?: string;
  }) {
    await this.owned('fuelPump', dto.pumpId, dto.businessId, 'Pump');
    return this.prisma.fuelPumpMaintenance.create({
      data: {
        businessId: dto.businessId,
        pumpId: dto.pumpId,
        type: text(dto.type, 'Type', 40),
        description: text(dto.description, 'Description', 500),
        technicianName: optionalText(dto.technicianName, 'Technician', 100),
        costCents: intInRange(dto.costCents ?? 0, 'Cost', 0, MAX_MONEY_CENTS),
        ...(dto.status !== undefined && { status: oneOf(dto.status, 'Status', MAINTENANCE_STATUSES) }),
        startedAt: dto.startedAt ? this.date(dto.startedAt, 'Start date') : new Date(),
        completedAt: dto.completedAt ? this.date(dto.completedAt, 'Completion date') : undefined,
        notes: optionalText(dto.notes, 'Notes', 500),
      },
      include: { pump: { select: { pumpNumber: true, label: true } } },
    });
  }

  async updateMaintenanceLog(id: string, businessId: string, dto: { status?: string; completedAt?: string; notes?: string; costCents?: number }) {
    await this.owned('fuelPumpMaintenance', id, businessId, 'Maintenance record');
    return this.prisma.fuelPumpMaintenance.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: oneOf(dto.status, 'Status', MAINTENANCE_STATUSES) }),
        ...(dto.completedAt && { completedAt: this.date(dto.completedAt, 'Completion date') }),
        ...(dto.notes !== undefined && { notes: optionalText(dto.notes, 'Notes', 500) ?? null }),
        ...(dto.costCents !== undefined && { costCents: intInRange(dto.costCents, 'Cost', 0, MAX_MONEY_CENTS) }),
      },
    });
  }

  private date(value: string, label: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} is not a valid date`);
    return d;
  }
}
