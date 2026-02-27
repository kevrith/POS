import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async salesReport(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { businessId, status: 'PAID' };
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [sales, totalSales, totalRevenue] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({
        where,
        _sum: { totalCents: true, vatCents: true, totCents: true },
      }),
    ]);

    return {
      sales,
      summary: {
        totalSales,
        totalRevenueCents: totalRevenue._sum.totalCents || 0,
        totalVatCents: totalRevenue._sum.vatCents || 0,
        totalTotCents: totalRevenue._sum.totCents || 0,
      },
    };
  }

  async paymentMethodBreakdown(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { sale: { businessId, status: 'PAID' } };
    if (storeId) where.sale.storeId = storeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const payments = await this.prisma.payment.groupBy({
      by: ['method'],
      where,
      _sum: { amountCents: true },
      _count: true,
    });

    return payments.map(p => ({
      method: p.method,
      totalCents: p._sum.amountCents || 0,
      count: p._count,
    }));
  }

  async vatReport(businessId: string, startDate: Date, endDate: Date) {
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: 'PAID',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        receiptNumber: true,
        createdAt: true,
        subtotalCents: true,
        vatCents: true,
        totalCents: true,
      },
    });

    const totalVat = sales.reduce((sum, s) => sum + s.vatCents, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.totalCents, 0);

    return { sales, totalVatCents: totalVat, totalSalesCents: totalSales };
  }

  async totReport(businessId: string, startDate: Date, endDate: Date) {
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: 'PAID',
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        receiptNumber: true,
        createdAt: true,
        subtotalCents: true,
        totCents: true,
        totalCents: true,
      },
    });

    const totalTot = sales.reduce((sum, s) => sum + s.totCents, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.totalCents, 0);

    return { sales, totalTotCents: totalTot, totalSalesCents: totalSales };
  }

  async stockValuation(businessId: string, storeId?: string) {
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
        trackStock: true,
        deletedAt: null,
      },
      include: { movements: true },
    });

    const valuation = items.map(item => {
      const quantity = item.movements.reduce((sum, m) => sum + m.quantity, 0);
      const valueCents = quantity * (item.costPriceCents || 0);
      return {
        itemId: item.id,
        name: item.name,
        quantity,
        costPriceCents: item.costPriceCents || 0,
        valueCents,
      };
    });

    const totalValueCents = valuation.reduce((sum, v) => sum + v.valueCents, 0);

    return { items: valuation, totalValueCents };
  }

  async profitAndLoss(businessId: string, startDate: Date, endDate: Date) {
    const [sales, expenses] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          businessId,
          status: 'PAID',
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { subtotalCents: true, totalCents: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          businessId,
          approvalStatus: 'APPROVED',
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const revenueCents = sales._sum.totalCents || 0;
    const cogsCents = 0; // COGS not tracked per-sale in this system
    const grossProfitCents = revenueCents - cogsCents;
    const expensesCents = expenses._sum.amountCents || 0;
    const netProfitCents = grossProfitCents - expensesCents;

    return {
      revenueCents,
      cogsCents,
      grossProfitCents,
      expensesCents,
      netProfitCents,
      profitMargin: revenueCents > 0 ? (netProfitCents / revenueCents) * 100 : 0,
    };
  }

  async xReport(businessId: string, storeId: string, cashierId: string) {
    const session = await this.prisma.cashDrawerSession.findFirst({
      where: { businessId, storeId, cashierId, status: 'OPEN' },
    });

    if (!session) {
      return { error: 'No open cash drawer session' };
    }

    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        storeId,
        cashierId,
        status: 'PAID',
        createdAt: { gte: session.openedAt },
      },
      include: { payments: true },
    });

    const totalSales = sales.length;
    const totalRevenueCents = sales.reduce((sum, s) => sum + s.totalCents, 0);
    const cashPayments = sales.flatMap(s => s.payments).filter(p => p.method === 'CASH');
    const totalCashCents = cashPayments.reduce((sum, p) => sum + p.amountCents, 0);

    return {
      sessionId: session.id,
      openedAt: session.openedAt,
      totalSales,
      totalRevenueCents,
      totalCashCents,
      openingBalanceCents: session.openingBalanceCents,
      expectedCashCents: session.openingBalanceCents + totalCashCents,
    };
  }

  async zReport(businessId: string, storeId: string, cashierId: string, closingBalanceCents: number) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.cashDrawerSession.findFirst({
        where: { businessId, storeId, cashierId, status: 'OPEN' },
      });

      if (!session) {
        throw new Error('No open cash drawer session');
      }

      const sales = await tx.sale.findMany({
        where: {
          businessId,
          storeId,
          cashierId,
          status: 'PAID',
          createdAt: { gte: session.openedAt },
        },
        include: { payments: true },
      });

      const totalRevenueCents = sales.reduce((sum, s) => sum + s.totalCents, 0);
      const cashPayments = sales.flatMap(s => s.payments).filter(p => p.method === 'CASH');
      const totalCashCents = cashPayments.reduce((sum, p) => sum + p.amountCents, 0);
      const expectedCashCents = session.openingBalanceCents + totalCashCents;
      const varianceCents = closingBalanceCents - expectedCashCents;

      await tx.cashDrawerSession.update({
        where: { id: session.id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closingBalanceCents,
          expectedBalanceCents: expectedCashCents,
          varianceCents,
        },
      });

      const store = await tx.store.update({
        where: { id: storeId },
        data: { zReportSequence: { increment: 1 } },
      });

      return {
        zReportNumber: `Z-${store.storeCode}-${new Date().getFullYear()}-${String(store.zReportSequence).padStart(4, '0')}`,
        sessionId: session.id,
        openedAt: session.openedAt,
        closedAt: new Date(),
        totalSales: sales.length,
        totalRevenueCents,
        totalCashCents,
        openingBalanceCents: session.openingBalanceCents,
        closingBalanceCents,
        expectedCashCents,
        varianceCents,
      };
    });
  }

  async expenseReport(businessId: string, startDate?: Date, endDate?: Date, category?: string) {
    const where: any = { businessId, approvalStatus: 'APPROVED' };
    if (category) where.category = category;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [expenses, byCategory] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where,
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);

    return {
      expenses,
      byCategory: byCategory.map(c => ({
        category: c.category,
        totalCents: c._sum.amountCents || 0,
        count: c._count,
      })),
      totalCents: expenses.reduce((sum, e) => sum + e.amountCents, 0),
    };
  }

  async commissionReport(businessId: string, employeeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { businessId, status: 'PAID' };
    if (employeeId) where.cashierId = employeeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: { cashier: { include: { employee: true } } },
    });

    const byEmployee = sales.reduce((acc, sale) => {
      if (!sale.cashier?.employee) return acc;
      
      const empId = sale.cashier.id;
      if (!acc[empId]) {
        acc[empId] = {
          employeeId: empId,
          employeeName: sale.cashier.name,
          commissionRate: sale.cashier.employee.commissionRate,
          salesCount: 0,
          totalSalesCents: 0,
          commissionCents: 0,
        };
      }

      acc[empId].salesCount++;
      acc[empId].totalSalesCents += sale.subtotalCents;
      acc[empId].commissionCents += Math.round(sale.subtotalCents * (sale.cashier.employee.commissionRate / 100));

      return acc;
    }, {} as Record<string, any>);

    return Object.values(byEmployee);
  }

  async attendanceReport(businessId: string, employeeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (startDate || endDate) {
      where.shiftDate = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where,
      include: { employee: { include: { user: true } } },
      orderBy: { shiftDate: 'desc' },
    });

    return records.map(r => ({
      id: r.id,
      employeeName: r.employee.user.name,
      shiftDate: r.shiftDate,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      hoursWorked: r.clockOut ? (r.clockOut.getTime() - r.clockIn.getTime()) / (1000 * 60 * 60) : null,
      isLate: r.isLate,
    }));
  }
}
