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

type OwnedModel = 'fuelGrade' | 'fuelSale' | 'fuelPump' | 'fuelTank' | 'fuelShift' | 'fleetAccount' | 'fuelPumpMaintenance';

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

  async updateGrade(
    id: string,
    businessId: string,
    dto: { name?: string; code?: string; pricePerLitreCents?: number; isActive?: boolean },
  ) {
    const grade = await this.owned('fuelGrade', id, businessId, 'Grade');
    const updated = await this.prisma.fuelGrade.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: text(dto.name, 'Name', 60) }),
        ...(dto.code !== undefined && { code: text(dto.code, 'Code', 20) }),
        ...(dto.pricePerLitreCents !== undefined && {
          pricePerLitreCents: intInRange(dto.pricePerLitreCents, 'Price per litre', 1, MAX_PRICE_PER_LITRE_CENTS),
        }),
        ...(dto.isActive !== undefined && { isActive: Boolean(dto.isActive) }),
      },
    });
    // The catalogue item the grade is invoiced as follows its price.
    if (grade.itemId && dto.pricePerLitreCents !== undefined) {
      await this.prisma.item.updateMany({ where: { id: grade.itemId, businessId }, data: { retailPriceCents: updated.pricePerLitreCents } });
    }
    return updated;
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

  // ── Pumps ─────────────────────────────────────────────────────────────────

  getPumps(businessId: string, storeId: string) {
    return this.prisma.fuelPump.findMany({
      where: { businessId, storeId },
      include: { grade: true },
      orderBy: { pumpNumber: 'asc' },
    });
  }

  async createPump(dto: { businessId: string; storeId: string; pumpNumber: number; label?: string; gradeId: string; nozzleCount?: number }) {
    await this.assertStore(dto.storeId, dto.businessId);
    const grade = await this.owned('fuelGrade', dto.gradeId, dto.businessId, 'Grade');
    if (grade.storeId !== dto.storeId) throw new BadRequestException('That grade belongs to a different store');
    const pumpNumber = intInRange(dto.pumpNumber, 'Pump number', 1, 999);
    const clash = await this.prisma.fuelPump.findFirst({ where: { businessId: dto.businessId, storeId: dto.storeId, pumpNumber } });
    if (clash) throw new BadRequestException(`Pump ${pumpNumber} already exists`);
    return this.prisma.fuelPump.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        pumpNumber,
        label: optionalText(dto.label, 'Label', 60),
        gradeId: dto.gradeId,
        ...(dto.nozzleCount !== undefined && { nozzleCount: intInRange(dto.nozzleCount, 'Nozzles', 1, 12) }),
      },
      include: { grade: true },
    });
  }

  async updatePump(
    id: string,
    businessId: string,
    dto: { label?: string; gradeId?: string; nozzleCount?: number; status?: string },
  ) {
    const pump = await this.owned('fuelPump', id, businessId, 'Pump');
    if (dto.gradeId !== undefined) {
      const grade = await this.owned('fuelGrade', dto.gradeId, businessId, 'Grade');
      if (grade.storeId !== pump.storeId) throw new BadRequestException('That grade belongs to a different store');
    }
    return this.prisma.fuelPump.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: optionalText(dto.label, 'Label', 60) ?? null }),
        ...(dto.gradeId !== undefined && { gradeId: dto.gradeId }),
        ...(dto.nozzleCount !== undefined && { nozzleCount: intInRange(dto.nozzleCount, 'Nozzles', 1, 12) }),
        ...(dto.status !== undefined && { status: oneOf(dto.status, 'Status', MANUAL_PUMP_STATUSES) }),
      },
      include: { grade: true },
    });
  }

  async authorizePump(id: string, businessId: string) {
    const pump = await this.owned('fuelPump', id, businessId, 'Pump');
    if (pump.status !== 'IDLE') throw new BadRequestException(`Pump is ${pump.status}`);

    const grade = await this.prisma.fuelGrade.findFirst({ where: { id: pump.gradeId, businessId } });
    // Check the linked tank has fuel (block if empty)
    const tank = await this.prisma.fuelTank.findFirst({
      where: { gradeId: pump.gradeId, businessId, storeId: pump.storeId, isActive: true },
    });
    if (tank && tank.currentLitres <= 0) {
      throw new BadRequestException(`Tank for ${grade?.name ?? 'this grade'} is empty. Cannot authorize pump.`);
    }

    // Claim the pump only if it is still idle: two attendants pressing Authorize cannot both win.
    const claimed = await this.prisma.fuelPump.updateMany({ where: { id, businessId, status: 'IDLE' }, data: { status: 'AUTHORIZED' } });
    if (claimed.count !== 1) throw new BadRequestException('Pump was just authorized by someone else');
    return this.prisma.fuelPump.findFirst({ where: { id, businessId }, include: { grade: true } });
  }

  async stopPump(id: string, businessId: string) {
    await this.owned('fuelPump', id, businessId, 'Pump');
    return this.prisma.fuelPump.update({ where: { id }, data: { status: 'IDLE' }, include: { grade: true } });
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

    const pump = await this.prisma.fuelPump.findFirst({ where: { id: dto.pumpId, businessId: dto.businessId }, include: { grade: true } });
    if (!pump) throw new NotFoundException('Pump not found');
    if (dto.gradeId && dto.gradeId !== pump.gradeId) throw new BadRequestException('This pump dispenses a different grade');
    if (!pump.grade?.isActive) throw new BadRequestException('This grade is switched off');

    const pricePerLitreCents = pump.grade.pricePerLitreCents;
    const totalCents = Math.round(litres * pricePerLitreCents);
    const businessId = dto.businessId;
    // Past the business's cutover, the sale also becomes a real Sale: receipt, eTIMS, Z-report, drawer, ledger.
    const invoice = await this.directSales.isEnabled(businessId);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // 1. Take the fuel out of a tank that has it. Several tanks can hold one grade; use the first that can
      //    cover the sale. A grade with no tank set up is not stock-tracked and sells as before.
      const tanks = await tx.fuelTank.findMany({
        where: { gradeId: pump.gradeId, businessId, storeId: pump.storeId, isActive: true },
        orderBy: { tankNumber: 'asc' },
      });
      let drawnFrom: string | null = null;
      if (tanks.length > 0) {
        let drawn = false;
        for (const tank of tanks) {
          const taken = await tx.fuelTank.updateMany({
            where: { id: tank.id, currentLitres: { gte: litres } },
            data: { currentLitres: { decrement: litres } },
          });
          if (taken.count === 1) { drawn = true; drawnFrom = tank.id; break; }
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
          gradeId: pump.gradeId,
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
        const gradeItem = await this.ensureGradeItem(tx, pump.grade);
        const onAccount = paymentMethod === 'FLEET' || paymentMethod === 'CREDIT';
        const input: DirectSaleInput = {
          businessId,
          storeId: pump.storeId,
          cashierId: dto.cashierId,
          source: 'FUEL',
          lines: [{
            itemId: gradeItem.id,
            name: `${pump.grade.name} (Pump ${pump.pumpNumber})`,
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

    const [totals, byGrade] = await Promise.all([
      this.prisma.fuelSale.aggregate({
        where,
        _sum: { totalCents: true, litresDispensed: true },
        _count: true,
      }),
      this.prisma.fuelSale.groupBy({
        by: ['gradeId'],
        where,
        _sum: { totalCents: true, litresDispensed: true },
        _count: true,
      }),
    ]);

    const grades = await this.prisma.fuelGrade.findMany({ where: { businessId, storeId } });
    const gradeMap = Object.fromEntries(grades.map((g) => [g.id, g.name]));

    return {
      totalRevenueCents: totals._sum.totalCents ?? 0,
      totalLitres: totals._sum.litresDispensed ?? 0,
      totalTransactions: totals._count,
      byGrade: byGrade.map((g) => ({
        gradeId: g.gradeId,
        gradeName: gradeMap[g.gradeId] ?? g.gradeId,
        revenueCents: g._sum.totalCents ?? 0,
        litres: g._sum.litresDispensed ?? 0,
        transactions: g._count,
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

  async recordDipping(dto: { businessId: string; tankId: string; litres: number; recordedBy: string; notes?: string }) {
    const tank = await this.owned('fuelTank', dto.tankId, dto.businessId, 'Tank');
    const litres = numberInRange(dto.litres, 'Dipping reading', { min: 0, max: tank.capacityLitres });
    const [dipping] = await this.prisma.$transaction([
      this.prisma.fuelTankDipping.create({
        data: { businessId: dto.businessId, tankId: tank.id, litres, recordedBy: text(dto.recordedBy, 'Recorded by', 100), notes: optionalText(dto.notes, 'Notes', 500) },
      }),
      this.prisma.fuelTank.update({ where: { id: tank.id }, data: { currentLitres: litres } }),
    ]);
    return dipping;
  }

  async getDippings(businessId: string, tankId: string) {
    await this.owned('fuelTank', tankId, businessId, 'Tank');
    return this.prisma.fuelTankDipping.findMany({
      where: { tankId, businessId },
      orderBy: { recordedAt: 'desc' },
      take: 30,
    });
  }

  async recordDelivery(dto: { businessId: string; tankId: string; litresDelivered: number; supplierName?: string; docketNumber?: string; deliveredBy?: string; notes?: string }) {
    const tank = await this.owned('fuelTank', dto.tankId, dto.businessId, 'Tank');
    const litresDelivered = numberInRange(dto.litresDelivered, 'Litres delivered', { min: 0, max: tank.capacityLitres, exclusiveMin: true });
    const room = tank.capacityLitres - tank.currentLitres;
    // A delivery that does not fit means the book level is wrong, not that fuel vanished. Silently capping
    // it would record litres the tank never received.
    if (litresDelivered > room + 0.0005) {
      throw new BadRequestException(
        `That delivery does not fit: the tank has ${room.toFixed(2)}L of room on the books. Record a dipping first if the level is out of date.`,
      );
    }
    const [delivery] = await this.prisma.$transaction([
      this.prisma.fuelDelivery.create({
        data: {
          businessId: dto.businessId,
          tankId: tank.id,
          litresDelivered,
          supplierName: optionalText(dto.supplierName, 'Supplier', 100),
          docketNumber: optionalText(dto.docketNumber, 'Docket number', 50),
          deliveredBy: optionalText(dto.deliveredBy, 'Delivered by', 100),
          notes: optionalText(dto.notes, 'Notes', 500),
        },
      }),
      this.prisma.fuelTank.update({ where: { id: tank.id }, data: { currentLitres: { increment: litresDelivered } } }),
    ]);
    return delivery;
  }

  getDeliveries(businessId: string, startDate?: string, endDate?: string) {
    return this.prisma.fuelDelivery.findMany({
      where: {
        businessId,
        ...(startDate || endDate
          ? {
              deliveredAt: {
                ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
                ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
              },
            }
          : {}),
      },
      include: { tank: { include: { grade: true } } },
      orderBy: { deliveredAt: 'desc' },
      take: 100,
    });
  }

  // ── Variance Report ───────────────────────────────────────────────────────
  // Compare dispensed sales vs dipping readings to detect shrinkage/losses

  async getVarianceReport(businessId: string, storeId: string, startDate?: string, endDate?: string) {
    const dateFilter = startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
            ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
          },
        }
      : {};

    const tanks = await this.prisma.fuelTank.findMany({
      where: { businessId, storeId, isActive: true },
      include: {
        grade: true,
        dippings: {
          where: startDate || endDate
            ? {
                recordedAt: {
                  ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
                  ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
                },
              }
            : {},
          orderBy: { recordedAt: 'asc' },
        },
        deliveries: {
          where: startDate || endDate
            ? {
                deliveredAt: {
                  ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
                  ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
                },
              }
            : {},
        },
      },
    });

    const results = await Promise.all(
      tanks.map(async (tank) => {
        // Total dispensed by grade via sales
        const salesAgg = await this.prisma.fuelSale.aggregate({
          where: { businessId, storeId, gradeId: tank.gradeId, status: 'COMPLETED', ...dateFilter },
          _sum: { litresDispensed: true },
        });
        const dispensedLitres = salesAgg._sum.litresDispensed ?? 0;

        // Total delivered into this tank
        const deliveredLitres = tank.deliveries.reduce((s, d) => s + d.litresDelivered, 0);

        // Opening and closing dipping readings
        const openingDipping = tank.dippings[0];
        const closingDipping = tank.dippings[tank.dippings.length - 1];
        const openingLitres = openingDipping?.litres ?? tank.currentLitres + dispensedLitres - deliveredLitres;
        const closingLitres = closingDipping?.litres ?? tank.currentLitres;

        // Expected closing = opening + deliveries - dispensed
        const expectedClosing = openingLitres + deliveredLitres - dispensedLitres;
        const varianceLitres = closingLitres - expectedClosing;
        const variancePct = expectedClosing !== 0 ? (varianceLitres / expectedClosing) * 100 : 0;

        return {
          tankId: tank.id,
          tankNumber: tank.tankNumber,
          label: tank.label ?? `Tank ${tank.tankNumber}`,
          gradeName: tank.grade.name,
          openingLitres,
          deliveredLitres,
          dispensedLitres,
          expectedClosingLitres: expectedClosing,
          actualClosingLitres: closingLitres,
          varianceLitres: parseFloat(varianceLitres.toFixed(2)),
          variancePct: parseFloat(variancePct.toFixed(2)),
          status: Math.abs(variancePct) > 1 ? 'ALERT' : 'OK',
        };
      }),
    );

    return results;
  }

  // ── Shift Management ───────────────────────────────────────────────────────

  getShifts(businessId: string, storeId: string) {
    return this.prisma.fuelShift.findMany({
      where: { businessId, storeId },
      include: { readings: true },
      orderBy: { openedAt: 'desc' },
      take: 20,
    });
  }

  getOpenShift(businessId: string, storeId: string) {
    return this.prisma.fuelShift.findFirst({
      where: { businessId, storeId, status: 'OPEN' },
      include: { readings: true },
    });
  }

  async openShift(dto: {
    businessId: string;
    storeId: string;
    cashierId?: string;
    cashierName: string;
    readings: Array<{ pumpId: string; openingLitres: number }>;
  }) {
    await this.assertStore(dto.storeId, dto.businessId);
    const cashierName = text(dto.cashierName, 'Cashier name', 100);
    const readings = (Array.isArray(dto.readings) ? dto.readings : []).map((r) => ({
      pumpId: text(r?.pumpId, 'Pump', 64),
      openingLitres: numberInRange(r?.openingLitres, 'Opening reading', { min: 0, max: 1e9 }),
    }));
    if (new Set(readings.map((r) => r.pumpId)).size !== readings.length) {
      throw new BadRequestException('Each pump can have only one opening reading');
    }
    if (readings.length > 0) {
      const found = await this.prisma.fuelPump.count({
        where: { id: { in: readings.map((r) => r.pumpId) }, businessId: dto.businessId, storeId: dto.storeId },
      });
      if (found !== readings.length) throw new BadRequestException('A reading names a pump that is not in this store');
    }

    return this.prisma.$transaction(async (tx) => {
      const open = await tx.fuelShift.findFirst({ where: { businessId: dto.businessId, storeId: dto.storeId, status: 'OPEN' } });
      if (open) throw new BadRequestException('A shift is already open. Close it before opening another.');
      return tx.fuelShift.create({
        data: {
          businessId: dto.businessId,
          storeId: dto.storeId,
          cashierId: dto.cashierId,
          cashierName,
          readings: { create: readings },
        },
        include: { readings: true },
      });
    });
  }

  async closeShift(id: string, businessId: string, closingReadings: Array<{ pumpId: string; closingLitres: number }>) {
    const shift = await this.prisma.fuelShift.findFirst({ where: { id, businessId }, include: { readings: true } });
    if (!shift) throw new NotFoundException('Shift not found');
    if (shift.status !== 'OPEN') throw new BadRequestException('This shift is already closed');

    const opening = new Map(shift.readings.map((r) => [r.pumpId, r.openingLitres]));
    const readings = (Array.isArray(closingReadings) ? closingReadings : []).map((r) => {
      const pumpId = text(r?.pumpId, 'Pump', 64);
      if (!opening.has(pumpId)) throw new BadRequestException('A closing reading names a pump that was not in this shift');
      const closingLitres = numberInRange(r?.closingLitres, 'Closing reading', { min: opening.get(pumpId) as number, max: 1e9 });
      return { pumpId, closingLitres };
    });

    await this.prisma.$transaction(async (tx) => {
      // Claim the close: a second close, or two at once, finds the shift no longer OPEN.
      const claimed = await tx.fuelShift.updateMany({ where: { id, businessId, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException('This shift is already closed');
      for (const r of readings) {
        await tx.fuelShiftReading.updateMany({ where: { shiftId: id, pumpId: r.pumpId }, data: { closingLitres: r.closingLitres } });
      }
    });
    return this.prisma.fuelShift.findFirst({ where: { id, businessId }, include: { readings: true } });
  }

  async getShiftSummary(shiftId: string, businessId: string) {
    const shift = await this.prisma.fuelShift.findFirst({
      where: { id: shiftId, businessId },
      include: { readings: true },
    });
    if (!shift) throw new NotFoundException('Shift not found');

    const dateFilter = {
      createdAt: {
        gte: shift.openedAt,
        ...(shift.closedAt ? { lte: shift.closedAt } : {}),
      },
    };

    // Sales during shift
    const sales = await this.prisma.fuelSale.findMany({
      where: { businessId: shift.businessId, storeId: shift.storeId, status: 'COMPLETED', ...dateFilter },
      include: { pump: true, grade: true },
    });

    // Group by pump
    const pumpMap: Record<string, {
      pumpId: string; pumpLabel: string; pumpNumber: number;
      litres: number; revenueCents: number; transactions: number;
      openingLitres: number; closingLitres: number | null;
    }> = {};

    for (const r of shift.readings) {
      pumpMap[r.pumpId] = {
        pumpId: r.pumpId,
        pumpLabel: '',
        pumpNumber: 0,
        litres: 0,
        revenueCents: 0,
        transactions: 0,
        openingLitres: r.openingLitres,
        closingLitres: r.closingLitres ?? null,
      };
    }

    for (const s of sales) {
      if (!pumpMap[s.pumpId]) {
        pumpMap[s.pumpId] = {
          pumpId: s.pumpId,
          pumpLabel: s.pump?.label ?? `Pump ${s.pump?.pumpNumber}`,
          pumpNumber: s.pump?.pumpNumber ?? 0,
          litres: 0,
          revenueCents: 0,
          transactions: 0,
          openingLitres: 0,
          closingLitres: null,
        };
      }
      pumpMap[s.pumpId].pumpLabel = s.pump?.label ?? `Pump ${s.pump?.pumpNumber}`;
      pumpMap[s.pumpId].pumpNumber = s.pump?.pumpNumber ?? 0;
      pumpMap[s.pumpId].litres += s.litresDispensed;
      pumpMap[s.pumpId].revenueCents += s.totalCents;
      pumpMap[s.pumpId].transactions += 1;
    }

    // Group by payment method
    const byPayment: Record<string, { method: string; count: number; totalCents: number }> = {};
    for (const s of sales) {
      if (!byPayment[s.paymentMethod]) byPayment[s.paymentMethod] = { method: s.paymentMethod, count: 0, totalCents: 0 };
      byPayment[s.paymentMethod].count += 1;
      byPayment[s.paymentMethod].totalCents += s.totalCents;
    }

    return {
      shift,
      totalLitres: sales.reduce((s, x) => s + x.litresDispensed, 0),
      totalRevenueCents: sales.reduce((s, x) => s + x.totalCents, 0),
      totalTransactions: sales.length,
      byPump: Object.values(pumpMap),
      byPayment: Object.values(byPayment),
    };
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
