import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CashDrawerService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async openSession(data: {
    businessId: string;
    storeId: string;
    cashierId: string;
    openingBalanceCents: number;
    tillNumber?: number;
  }) {
    if (data.tillNumber) {
      const existing = await this.prisma.cashDrawerSession.findFirst({
        where: { businessId: data.businessId, storeId: data.storeId, tillNumber: data.tillNumber, status: 'OPEN' },
      });
      if (existing) throw new Error(`Till ${data.tillNumber} is already open`);
    }
    return this.prisma.cashDrawerSession.create({
      data: {
        ...data,
        status: 'OPEN',
        openedAt: new Date(),
      },
    });
  }

  async closeSession(sessionId: string, data: {
    closingBalanceCents: number;
    expectedBalanceCents: number;
    notes?: string;
  }) {
    const varianceCents = data.closingBalanceCents - data.expectedBalanceCents;

    const session = await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        varianceCents,
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    if (Math.abs(varianceCents) > 500) {
      this.notificationsService.notifyCashDiscrepancy(
        session.businessId,
        session.storeId,
        varianceCents,
        session.cashierId,
      ).catch(() => {});
    }

    return session;
  }

  async getCurrentSession(cashierId: string, storeId: string) {
    return this.prisma.cashDrawerSession.findFirst({
      where: {
        cashierId,
        storeId,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });

    const sales = await this.prisma.sale.aggregate({
      where: {
        cashierId: session.cashierId,
        storeId: session.storeId,
        status: 'PAID',
        createdAt: {
          gte: session.openedAt,
          lte: session.closedAt || new Date(),
        },
      },
      _sum: { totalCents: true },
      _count: true,
    });

    const cashPayments = await this.prisma.payment.aggregate({
      where: {
        method: 'CASH',
        sale: {
          cashierId: session.cashierId,
          storeId: session.storeId,
          createdAt: {
            gte: session.openedAt,
            lte: session.closedAt || new Date(),
          },
        },
      },
      _sum: { amountCents: true },
    });

    const expenses = await this.prisma.expense.aggregate({
      where: {
        cashDrawerSessionId: sessionId,
      },
      _sum: { amountCents: true },
    });

    return {
      session,
      totalSalesCents: sales._sum.totalCents || 0,
      salesCount: sales._count,
      cashPaymentsCents: cashPayments._sum.amountCents || 0,
      expensesCents: expenses._sum.amountCents || 0,
      expectedBalanceCents:
        session.openingBalanceCents +
        (cashPayments._sum.amountCents || 0) -
        (expenses._sum.amountCents || 0),
    };
  }

  async getActiveSessions(storeId: string, businessId?: string) {
    return this.prisma.cashDrawerSession.findMany({
      where: { storeId, status: 'OPEN', ...(businessId ? { businessId } : {}) },
      orderBy: { tillNumber: 'asc' },
    });
  }
}
