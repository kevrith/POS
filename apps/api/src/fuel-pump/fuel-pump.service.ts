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
    const pump = await this.prisma.fuelPump.findUnique({ where: { id } });
    if (!pump) throw new NotFoundException('Pump not found');
    if (pump.status !== 'IDLE') throw new BadRequestException(`Pump is ${pump.status}`);
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
    if (!tank) throw new Error('Tank not found');
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
    if (!account) throw new Error('Fleet account not found');
    const newBalance = account.balanceCents - amountCents;
    if (account.creditLimitCents > 0 && Math.abs(newBalance) > account.creditLimitCents) {
      throw new Error('Credit limit exceeded');
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
}
