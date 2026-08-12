import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Payment methods that settle as physical cash in the drawer. */
const CASH_METHODS = ['CASH'];

export interface DrawerSummary {
  totalSalesCents: number;
  salesCount: number;
  transactionCount: number;
  totalVatCents: number;
  cashSalesCents: number;
  mpesaSalesCents: number;
  otherPaymentsCents: number;
  refundsCents: number;
  cashRefundsCents: number;
  expensesCents: number;
  paymentBreakdown: Array<{ method: string; amountCents: number; count: number }>;
  /** Opening float + cash in − cash refunds − cash paid out. This is what should be counted. */
  expectedClosingCents: number;
}

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
    if (!data.storeId?.trim()) {
      throw new BadRequestException(
        'A store must be selected before opening the drawer',
      );
    }
    if (!data.cashierId?.trim()) {
      throw new BadRequestException('Cashier is required');
    }
    if (!Number.isInteger(data.openingBalanceCents) || data.openingBalanceCents < 0) {
      throw new BadRequestException('Opening balance must be zero or more');
    }

    const store = await this.prisma.store.findFirst({
      where: { id: data.storeId, businessId: data.businessId },
      select: { id: true },
    });
    if (!store) throw new BadRequestException('Store not found in this business');

    // One open drawer per cashier per store — otherwise "current session" is ambiguous
    // and every session double-counts the same sales.
    const openForCashier = await this.prisma.cashDrawerSession.findFirst({
      where: {
        businessId: data.businessId,
        storeId: data.storeId,
        cashierId: data.cashierId,
        status: 'OPEN',
      },
    });
    if (openForCashier) {
      throw new BadRequestException(
        'You already have an open drawer session — close it before opening a new one',
      );
    }

    if (data.tillNumber) {
      const existing = await this.prisma.cashDrawerSession.findFirst({
        where: {
          businessId: data.businessId,
          storeId: data.storeId,
          tillNumber: data.tillNumber,
          status: 'OPEN',
        },
      });
      if (existing) {
        throw new BadRequestException(`Till ${data.tillNumber} is already open`);
      }
    }

    return this.prisma.cashDrawerSession.create({
      data: {
        ...data,
        status: 'OPEN',
        openedAt: new Date(),
      },
    });
  }

  async closeSession(
    sessionId: string,
    data: {
      closingBalanceCents: number;
      /** Ignored when the server can compute it — kept for backwards compatibility. */
      expectedBalanceCents?: number;
      notes?: string;
    },
  ) {
    const existing = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing) throw new NotFoundException('Cash drawer session not found');
    if (existing.status === 'CLOSED') {
      throw new BadRequestException('This session is already closed');
    }

    // Always recompute server-side. Trusting the client's number is how a session
    // ends up with a variance equal to the entire count.
    const summary = await this.buildSummary(existing);
    const expectedBalanceCents = summary.expectedClosingCents;
    const varianceCents = data.closingBalanceCents - expectedBalanceCents;

    const session = await this.prisma.cashDrawerSession.update({
      where: { id: sessionId },
      data: {
        closingBalanceCents: data.closingBalanceCents,
        expectedBalanceCents,
        notes: data.notes,
        varianceCents,
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    if (Math.abs(varianceCents) > 500) {
      this.notificationsService
        .notifyCashDiscrepancy(
          session.businessId,
          session.storeId,
          varianceCents,
          session.cashierId,
        )
        .catch(() => {});
    }

    return { ...session, summary };
  }

  async getCurrentSession(cashierId: string, storeId: string) {
    if (!cashierId?.trim() || !storeId?.trim()) return null;
    return this.prisma.cashDrawerSession.findFirst({
      where: { cashierId, storeId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.prisma.cashDrawerSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('Cash drawer session not found');

    const summary = await this.buildSummary(session);
    // Flattened alongside `summary` so both the drawer screen and the X-report
    // read the same object without either needing a second request.
    return { session, ...summary, summary, generatedAt: new Date().toISOString() };
  }

  async getActiveSessions(storeId: string | undefined, businessId?: string) {
    if (!storeId && !businessId) return [];
    return this.prisma.cashDrawerSession.findMany({
      where: {
        status: 'OPEN',
        ...(storeId ? { storeId } : {}),
        ...(businessId ? { businessId } : {}),
      },
      orderBy: { tillNumber: 'asc' },
    });
  }

  /**
   * Everything that moved through this drawer between open and close.
   * Payments are the source of truth for cash (a sale can be split-tendered), and
   * cash refunds / cash expenses are subtracted because they physically leave the till.
   */
  async buildSummary(session: {
    id: string;
    businessId: string;
    storeId: string;
    cashierId: string;
    openingBalanceCents: number;
    openedAt: Date;
    closedAt: Date | null;
  }): Promise<DrawerSummary> {
    const from = session.openedAt;
    const to = session.closedAt ?? new Date();

    const sales = await this.prisma.sale.findMany({
      where: {
        businessId: session.businessId,
        storeId: session.storeId,
        cashierId: session.cashierId,
        status: { in: ['PAID', 'AMENDED', 'CREDIT'] },
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        totalCents: true,
        vatCents: true,
        payments: { select: { method: true, amountCents: true } },
      },
    });

    const totalSalesCents = sales.reduce((s, x) => s + x.totalCents, 0);
    const totalVatCents = sales.reduce((s, x) => s + (x.vatCents ?? 0), 0);

    const breakdown = new Map<string, { amountCents: number; count: number }>();
    for (const sale of sales) {
      for (const p of sale.payments) {
        const row = breakdown.get(p.method) ?? { amountCents: 0, count: 0 };
        row.amountCents += p.amountCents;
        row.count += 1;
        breakdown.set(p.method, row);
      }
    }

    const paymentBreakdown = [...breakdown.entries()]
      .map(([method, v]) => ({ method, ...v }))
      .sort((a, b) => b.amountCents - a.amountCents);

    const cashSalesCents = paymentBreakdown
      .filter((p) => CASH_METHODS.includes(p.method))
      .reduce((s, p) => s + p.amountCents, 0);
    const mpesaSalesCents = paymentBreakdown
      .filter((p) => p.method.startsWith('MPESA'))
      .reduce((s, p) => s + p.amountCents, 0);
    const otherPaymentsCents =
      paymentBreakdown.reduce((s, p) => s + p.amountCents, 0) -
      cashSalesCents -
      mpesaSalesCents;

    const returns = await this.prisma.return.findMany({
      where: {
        businessId: session.businessId,
        createdAt: { gte: from, lte: to },
        sale: { storeId: session.storeId, cashierId: session.cashierId },
      },
      select: { refundAmountCents: true, refundMethod: true },
    });
    const refundsCents = returns.reduce((s, r) => s + r.refundAmountCents, 0);
    const cashRefundsCents = returns
      .filter((r) => CASH_METHODS.includes(r.refundMethod))
      .reduce((s, r) => s + r.refundAmountCents, 0);

    const expenses = await this.prisma.expense.aggregate({
      where: { cashDrawerSessionId: session.id },
      _sum: { amountCents: true },
    });
    const expensesCents = expenses._sum.amountCents ?? 0;

    return {
      totalSalesCents,
      salesCount: sales.length,
      transactionCount: sales.length,
      totalVatCents,
      cashSalesCents,
      mpesaSalesCents,
      otherPaymentsCents,
      refundsCents,
      cashRefundsCents,
      expensesCents,
      paymentBreakdown,
      expectedClosingCents:
        session.openingBalanceCents + cashSalesCents - cashRefundsCents - expensesCents,
    };
  }
}
