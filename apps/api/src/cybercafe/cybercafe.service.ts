import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class CybercafeService {
  constructor(private prisma: PrismaService, private events: EventsGateway) {}

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

  createStation(dto: {
    businessId: string;
    storeId: string;
    number: number;
    label?: string;
    specs?: string;
    ratePerHourCents: number;
  }) {
    return this.prisma.cyberStation.create({ data: dto });
  }

  updateStation(id: string, dto: { label?: string; specs?: string; ratePerHourCents?: number; status?: string; isActive?: boolean }) {
    return this.prisma.cyberStation.update({ where: { id }, data: dto });
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  async startSession(dto: {
    businessId: string;
    storeId: string;
    stationId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    packageId?: string;
    ratePerHourCents?: number;
    notes?: string;
  }) {
    const station = await this.prisma.cyberStation.findUnique({ where: { id: dto.stationId } });
    if (!station) throw new NotFoundException('Station not found');
    if (station.status !== 'AVAILABLE') throw new BadRequestException(`Station is ${station.status}`);

    // If package, get the rate from package price
    let ratePerHourCents = dto.ratePerHourCents ?? station.ratePerHourCents;
    let pkg: any = null;
    if (dto.packageId) {
      pkg = await this.prisma.cyberPackage.findUnique({ where: { id: dto.packageId } });
      if (!pkg) throw new NotFoundException('Package not found');
      ratePerHourCents = Math.round(pkg.priceCents / (pkg.durationMinutes / 60));
    }

    const [session] = await this.prisma.$transaction([
      this.prisma.cyberSession.create({
        data: {
          businessId: dto.businessId,
          storeId: dto.storeId,
          stationId: dto.stationId,
          customerId: dto.customerId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          packageId: dto.packageId,
          timeLimitMinutes: dto.packageId && pkg ? pkg.durationMinutes : undefined,
          ratePerHourCents,
          notes: dto.notes,
          startedAt: new Date(),
        },
        include: { station: true, package: true },
      }),
      this.prisma.cyberStation.update({
        where: { id: dto.stationId },
        data: { status: 'IN_USE' },
      }),
    ]);
    return session;
  }

  async pauseSession(sessionId: string) {
    const session = await this.prisma.cyberSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'ACTIVE') throw new BadRequestException('Session is not active');

    const [updated] = await this.prisma.$transaction([
      this.prisma.cyberSession.update({
        where: { id: sessionId },
        data: { status: 'PAUSED', pausedAt: new Date() },
        include: { station: true, package: true },
      }),
      this.prisma.cyberStation.update({
        where: { id: session.stationId },
        data: { status: 'PAUSED' },
      }),
    ]);
    return updated;
  }

  async resumeSession(sessionId: string) {
    const session = await this.prisma.cyberSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'PAUSED') throw new BadRequestException('Session is not paused');

    const now = new Date();
    const pausedMinutesAdded = session.pausedAt
      ? (now.getTime() - session.pausedAt.getTime()) / 60000
      : 0;

    const [updated] = await this.prisma.$transaction([
      this.prisma.cyberSession.update({
        where: { id: sessionId },
        data: {
          status: 'ACTIVE',
          pausedAt: null,
          pausedMinutes: { increment: pausedMinutesAdded },
        },
        include: { station: true, package: true },
      }),
      this.prisma.cyberStation.update({
        where: { id: session.stationId },
        data: { status: 'IN_USE' },
      }),
    ]);
    return updated;
  }

  async endSession(sessionId: string, dto: {
    paymentMethod?: string;
    paymentRef?: string;
    printPagesCents?: number;
    extrasCents?: number;
    notes?: string;
  }) {
    const session = await this.prisma.cyberSession.findUnique({
      where: { id: sessionId },
      include: { package: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'COMPLETED' || session.status === 'VOIDED') {
      throw new BadRequestException('Session already ended');
    }

    const now = new Date();

    // If still paused, account for that pause time
    let extraPausedMinutes = 0;
    if (session.status === 'PAUSED' && session.pausedAt) {
      extraPausedMinutes = (now.getTime() - session.pausedAt.getTime()) / 60000;
    }

    const totalPausedMinutes = session.pausedMinutes + extraPausedMinutes;
    const elapsedMinutes = (now.getTime() - session.startedAt.getTime()) / 60000;
    const billableMinutes = Math.max(0, elapsedMinutes - totalPausedMinutes);

    let totalCents: number;
    if (session.package) {
      // Package billing: fixed price
      totalCents = session.package.priceCents;
    } else {
      // Hourly billing: ceil to nearest minute, charge per minute
      totalCents = Math.round((billableMinutes / 60) * session.ratePerHourCents);
    }

    totalCents += (dto.printPagesCents ?? 0) + (dto.extrasCents ?? 0);

    const [updated] = await this.prisma.$transaction([
      this.prisma.cyberSession.update({
        where: { id: sessionId },
        data: {
          status: 'COMPLETED',
          endedAt: now,
          durationMinutes: parseFloat(billableMinutes.toFixed(2)),
          totalCents,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          printPagesCents: dto.printPagesCents ?? 0,
          extrasCents: dto.extrasCents ?? 0,
          notes: dto.notes,
          pausedMinutes: totalPausedMinutes,
        },
        include: { station: true, package: true },
      }),
      this.prisma.cyberStation.update({
        where: { id: session.stationId },
        data: { status: 'AVAILABLE' },
      }),
    ]);
    return updated;
  }

  async voidSession(sessionId: string) {
    const session = await this.prisma.cyberSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.cyberSession.update({
        where: { id: sessionId },
        data: { status: 'VOIDED', endedAt: new Date() },
        include: { station: true },
      }),
      this.prisma.cyberStation.update({
        where: { id: session.stationId },
        data: { status: 'AVAILABLE' },
      }),
    ]);
    return updated;
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
                ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
                ...(filters.endDate ? { lte: new Date(filters.endDate + 'T23:59:59') } : {}),
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

  createPackage(dto: { businessId: string; name: string; durationMinutes: number; priceCents: number; description?: string }) {
    return this.prisma.cyberPackage.create({ data: dto });
  }

  updatePackage(id: string, dto: { name?: string; durationMinutes?: number; priceCents?: number; description?: string; isActive?: boolean }) {
    return this.prisma.cyberPackage.update({ where: { id }, data: dto });
  }

  // ── Extend Session ────────────────────────────────────────────────────────

  async extendSession(sessionId: string, extraMinutes: number) {
    const session = await this.prisma.cyberSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'COMPLETED' || session.status === 'VOIDED') {
      throw new BadRequestException('Session already ended');
    }
    return this.prisma.cyberSession.update({
      where: { id: sessionId },
      data: {
        extendedMinutes: { increment: extraMinutes },
        ...(session.timeLimitMinutes ? { timeLimitMinutes: session.timeLimitMinutes + extraMinutes } : {}),
      },
      include: { station: true, package: true },
    });
  }

  // ── Rates ─────────────────────────────────────────────────────────────────

  getRates(businessId: string, storeId: string) {
    return this.prisma.cyberRate.findMany({
      where: { businessId, storeId, isActive: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  createRate(dto: { businessId: string; storeId: string; service: string; unit?: string; rateCents: number; category?: string; sortOrder?: number }) {
    return this.prisma.cyberRate.create({ data: { ...dto } });
  }

  updateRate(id: string, dto: { service?: string; unit?: string; rateCents?: number; category?: string; isActive?: boolean; sortOrder?: number }) {
    return this.prisma.cyberRate.update({ where: { id }, data: dto });
  }

  deleteRate(id: string) {
    return this.prisma.cyberRate.delete({ where: { id } });
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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate + 'T23:59:59') } : {}),
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
