import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FuelPumpService {
  constructor(private prisma: PrismaService) {}

  // ── Fuel Grades ──────────────────────────────────────────────────────────

  getGrades(businessId: string, storeId: string) {
    return this.prisma.fuelGrade.findMany({
      where: { businessId, storeId },
      orderBy: { name: 'asc' },
    });
  }

  createGrade(dto: { businessId: string; storeId: string; name: string; code: string; pricePerLitreCents: number }) {
    return this.prisma.fuelGrade.create({ data: dto });
  }

  updateGrade(id: string, dto: { name?: string; code?: string; pricePerLitreCents?: number; isActive?: boolean }) {
    return this.prisma.fuelGrade.update({ where: { id }, data: dto });
  }

  // ── Pumps ─────────────────────────────────────────────────────────────────

  getPumps(businessId: string, storeId: string) {
    return this.prisma.fuelPump.findMany({
      where: { businessId, storeId },
      include: { grade: true },
      orderBy: { pumpNumber: 'asc' },
    });
  }

  createPump(dto: { businessId: string; storeId: string; pumpNumber: number; label?: string; gradeId: string; nozzleCount?: number }) {
    return this.prisma.fuelPump.create({ data: dto, include: { grade: true } });
  }

  updatePump(id: string, dto: { label?: string; gradeId?: string; nozzleCount?: number; status?: string }) {
    return this.prisma.fuelPump.update({ where: { id }, data: dto, include: { grade: true } });
  }

  async authorizePump(id: string) {
    const pump = await this.prisma.fuelPump.findUnique({ where: { id }, include: { grade: true } });
    if (!pump) throw new NotFoundException('Pump not found');
    if (pump.status !== 'IDLE') throw new BadRequestException(`Pump is ${pump.status}`);

    // Check linked tank has sufficient fuel (warn if low, block if empty)
    const tank = await this.prisma.fuelTank.findFirst({
      where: { gradeId: pump.gradeId, businessId: pump.businessId, storeId: pump.storeId, isActive: true },
    });
    if (tank && tank.currentLitres <= 0) {
      throw new BadRequestException(`Tank for ${pump.grade?.name ?? 'this grade'} is empty. Cannot authorize pump.`);
    }

    return this.prisma.fuelPump.update({ where: { id }, data: { status: 'AUTHORIZED' }, include: { grade: true } });
  }

  async stopPump(id: string) {
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
                ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
                ...(filters.endDate ? { lte: new Date(filters.endDate + 'T23:59:59') } : {}),
              },
            }
          : {}),
      },
      include: { pump: true, grade: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async recordSale(dto: {
    businessId: string;
    storeId: string;
    pumpId: string;
    gradeId: string;
    cashierId?: string;
    customerId?: string;
    vehiclePlate?: string;
    litresDispensed: number;
    pricePerLitreCents: number;
    paymentMethod: string;
    paymentRef?: string;
    fleetAccountId?: string;
  }) {
    const totalCents = Math.round(dto.litresDispensed * dto.pricePerLitreCents);
    const { fleetAccountId, ...saleData } = dto;

    // Deduct from tank inventory
    const tank = await this.prisma.fuelTank.findFirst({
      where: { gradeId: dto.gradeId, businessId: dto.businessId, storeId: dto.storeId, isActive: true },
    });
    if (tank) {
      if (tank.currentLitres < dto.litresDispensed) {
        throw new BadRequestException(
          `Insufficient fuel in tank. Available: ${tank.currentLitres.toFixed(2)}L, Requested: ${dto.litresDispensed.toFixed(2)}L`,
        );
      }
      await this.prisma.fuelTank.update({
        where: { id: tank.id },
        data: { currentLitres: { decrement: dto.litresDispensed } },
      });
    }

    const [sale] = await this.prisma.$transaction([
      this.prisma.fuelSale.create({
        data: {
          ...saleData,
          totalCents,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: { pump: true, grade: true },
      }),
      this.prisma.fuelPump.update({ where: { id: dto.pumpId }, data: { status: 'IDLE' } }),
    ]);

    // Fleet account charge when payment method is FLEET
    if (dto.paymentMethod === 'FLEET' && fleetAccountId) {
      try {
        await this.chargeFleetAccount(
          fleetAccountId,
          totalCents,
          sale.id,
          `Fuel: ${dto.litresDispensed.toFixed(2)}L`,
          dto.businessId,
        );
      } catch (err: any) {
        console.error('Fleet charge error:', err?.message);
      }
    }

    return sale;
  }

  async getSaleStats(businessId: string, storeId: string, startDate?: string, endDate?: string) {
    const where = {
      businessId,
      storeId,
      status: 'COMPLETED',
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
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

  createTank(dto: { businessId: string; storeId: string; tankNumber: number; label?: string; gradeId: string; capacityLitres: number; minLevelLitres?: number }) {
    return this.prisma.fuelTank.create({ data: dto, include: { grade: true } });
  }

  updateTank(id: string, dto: { label?: string; capacityLitres?: number; minLevelLitres?: number; isActive?: boolean }) {
    return this.prisma.fuelTank.update({ where: { id }, data: dto, include: { grade: true } });
  }

  async recordDipping(dto: { businessId: string; tankId: string; litres: number; recordedBy: string; notes?: string }) {
    const [dipping] = await this.prisma.$transaction([
      this.prisma.fuelTankDipping.create({ data: dto }),
      this.prisma.fuelTank.update({ where: { id: dto.tankId }, data: { currentLitres: dto.litres } }),
    ]);
    return dipping;
  }

  getDippings(tankId: string) {
    return this.prisma.fuelTankDipping.findMany({
      where: { tankId },
      orderBy: { recordedAt: 'desc' },
      take: 30,
    });
  }

  async recordDelivery(dto: { businessId: string; tankId: string; litresDelivered: number; supplierName?: string; docketNumber?: string; deliveredBy?: string; notes?: string }) {
    const tank = await this.prisma.fuelTank.findUnique({ where: { id: dto.tankId } });
    if (!tank) throw new NotFoundException('Tank not found');
    const newLevel = Math.min(tank.currentLitres + dto.litresDelivered, tank.capacityLitres);
    const [delivery] = await this.prisma.$transaction([
      this.prisma.fuelDelivery.create({ data: dto }),
      this.prisma.fuelTank.update({ where: { id: dto.tankId }, data: { currentLitres: newLevel } }),
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
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
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
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
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
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
                },
              }
            : {},
          orderBy: { recordedAt: 'asc' },
        },
        deliveries: {
          where: startDate || endDate
            ? {
                deliveredAt: {
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
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
    const { readings, ...shiftData } = dto;
    return this.prisma.fuelShift.create({
      data: {
        ...shiftData,
        readings: { create: readings },
      },
      include: { readings: true },
    });
  }

  async closeShift(id: string, closingReadings: Array<{ pumpId: string; closingLitres: number }>) {
    await this.prisma.fuelShift.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } });
    for (const r of closingReadings) {
      await this.prisma.fuelShiftReading.updateMany({
        where: { shiftId: id, pumpId: r.pumpId },
        data: { closingLitres: r.closingLitres },
      });
    }
    return this.prisma.fuelShift.findUnique({ where: { id }, include: { readings: true } });
  }

  async getShiftSummary(shiftId: string) {
    const shift = await this.prisma.fuelShift.findUnique({
      where: { id: shiftId },
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

  createFleetAccount(dto: {
    businessId: string;
    companyName: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    creditLimitCents: number;
  }) {
    return this.prisma.fleetAccount.create({ data: dto });
  }

  updateFleetAccount(id: string, dto: any) {
    return this.prisma.fleetAccount.update({ where: { id }, data: dto });
  }

  getFleetTransactions(fleetAccountId: string) {
    return this.prisma.fleetTransaction.findMany({
      where: { fleetAccountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async recordFleetPayment(dto: {
    businessId: string;
    fleetAccountId: string;
    amountCents: number;
    reference?: string;
    description?: string;
  }) {
    const [tx] = await this.prisma.$transaction([
      this.prisma.fleetTransaction.create({
        data: { ...dto, type: 'PAYMENT' },
      }),
      this.prisma.fleetAccount.update({
        where: { id: dto.fleetAccountId },
        data: { balanceCents: { increment: dto.amountCents } },
      }),
    ]);
    return tx;
  }

  async chargeFleetAccount(
    fleetAccountId: string,
    amountCents: number,
    fuelSaleId?: string,
    description?: string,
    businessId?: string,
  ) {
    const account = await this.prisma.fleetAccount.findUnique({ where: { id: fleetAccountId } });
    if (!account) throw new NotFoundException('Fleet account not found');
    const newBalance = account.balanceCents - amountCents;
    if (account.creditLimitCents > 0 && Math.abs(newBalance) > account.creditLimitCents) {
      throw new BadRequestException('Credit limit exceeded');
    }
    const [tx] = await this.prisma.$transaction([
      this.prisma.fleetTransaction.create({
        data: {
          fleetAccountId,
          businessId: businessId ?? account.businessId,
          type: 'CHARGE',
          amountCents,
          fuelSaleId,
          description: description ?? 'Fuel charge',
        },
      }),
      this.prisma.fleetAccount.update({
        where: { id: fleetAccountId },
        data: { balanceCents: { decrement: amountCents } },
      }),
    ]);
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

  createMaintenanceLog(dto: {
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
    return this.prisma.fuelPumpMaintenance.create({
      data: {
        ...dto,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date(),
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
      include: { pump: { select: { pumpNumber: true, label: true } } },
    });
  }

  updateMaintenanceLog(id: string, dto: { status?: string; completedAt?: string; notes?: string; costCents?: number }) {
    return this.prisma.fuelPumpMaintenance.update({
      where: { id },
      data: {
        ...dto,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
    });
  }
}
