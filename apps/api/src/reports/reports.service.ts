import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Always extract VAT from inclusive amount (16/116). Fixes old data stored with exclusive formula. */
function recalcVat(subtotalCents: number, discountCents = 0): number {
  const taxBase = Math.max(0, subtotalCents - discountCents);
  return Math.round(taxBase * 16 / 116);
}
function recalcTot(subtotalCents: number, discountCents = 0): number {
  const taxBase = Math.max(0, subtotalCents - discountCents);
  return Math.round(taxBase * 3 / 103);
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async salesReport(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const [rawSales, totalSales, totalRevenue] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sale.count({ where }),
      this.prisma.sale.aggregate({
        where,
        _sum: { totalCents: true },
      }),
    ]);

    // Recalculate tax using inclusive formula (fixes historical data stored with exclusive formula)
    const sales = rawSales.map(s => ({
      ...s,
      vatCents: s.totCents > 0 ? 0 : recalcVat(s.subtotalCents, s.discountCents),
      totCents: s.totCents > 0 ? recalcTot(s.subtotalCents, s.discountCents) : 0,
    }));

    return {
      sales,
      summary: {
        totalSales,
        totalRevenueCents: totalRevenue._sum.totalCents || 0,
        totalVatCents: sales.reduce((s, x) => s + x.vatCents, 0),
        totalTotCents: sales.reduce((s, x) => s + x.totCents, 0),
      },
    };
  }

  async paymentMethodBreakdown(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { sale: { businessId, status: { in: ['PAID', 'AMENDED'] } } };
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
    const rawSales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: { in: ['PAID', 'AMENDED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        receiptNumber: true,
        createdAt: true,
        subtotalCents: true,
        discountCents: true,
        vatCents: true,
        totalCents: true,
      },
    });

    // Recalculate using inclusive formula
    const sales = rawSales.map(s => ({
      ...s,
      vatCents: recalcVat(s.subtotalCents, s.discountCents),
      netCents: Math.max(0, s.subtotalCents - s.discountCents) - recalcVat(s.subtotalCents, s.discountCents),
    }));

    const totalVat = sales.reduce((sum, s) => sum + s.vatCents, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.totalCents, 0);
    const totalNet = sales.reduce((sum, s) => sum + s.netCents, 0);

    return { sales, totalVatCents: totalVat, totalSalesCents: totalSales, totalNetCents: totalNet };
  }

  async totReport(businessId: string, startDate: Date, endDate: Date) {
    const rawSales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: { in: ['PAID', 'AMENDED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      select: {
        receiptNumber: true,
        createdAt: true,
        subtotalCents: true,
        discountCents: true,
        totCents: true,
        totalCents: true,
      },
    });

    // Recalculate using inclusive formula
    const sales = rawSales.map(s => ({
      ...s,
      totCents: recalcTot(s.subtotalCents, s.discountCents),
    }));

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
          status: { in: ['PAID', 'AMENDED'] },
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
        status: { in: ['PAID', 'AMENDED'] },
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
          status: { in: ['PAID', 'AMENDED'] },
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
    const where: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
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
      const emp = sale.cashier.employee as any;
      const basis: string = emp.commissionBasis ?? 'SALES_VALUE';

      if (!acc[empId]) {
        acc[empId] = {
          employeeId: empId,
          employeeName: sale.cashier.name,
          commissionRate: emp.commissionRate,
          commissionBasis: basis,
          salesCount: 0,
          totalSalesCents: 0,
          commissionCents: 0,
        };
      }

      acc[empId].salesCount++;
      acc[empId].totalSalesCents += sale.subtotalCents;

      // Commission calculation by basis
      if (basis === 'TRANSACTION_COUNT') {
        // commissionRate is KES per transaction (stored as flat amount)
        acc[empId].commissionCents += Math.round(emp.commissionRate * 100);
      } else {
        // SALES_VALUE and GROSS_MARGIN both use percentage of sale value
        acc[empId].commissionCents += Math.round(sale.subtotalCents * (emp.commissionRate / 100));
      }

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

  // ─── Recipe / BOM Variance ─────────────────────────────────────────────────

  async recipeVarianceReport(businessId: string, startDate: Date, endDate: Date) {
    // Get all recipe items and their ingredients
    const recipeItems = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null },
      include: {
        recipeIngredients: {
          include: { ingredientItem: true },
        },
      },
    });

    const itemsWithRecipe = recipeItems.filter((i) => i.recipeIngredients.length > 0);
    if (itemsWithRecipe.length === 0) return [];

    // Get sales for these items in the date range
    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: { businessId, status: { in: ['PAID', 'AMENDED'] }, createdAt: { gte: startDate, lte: endDate } },
        itemId: { in: itemsWithRecipe.map((i) => i.id) },
      },
      select: { itemId: true, quantity: true },
    });

    // Sum quantities sold per item
    const soldQty: Record<string, number> = {};
    for (const si of saleItems) {
      soldQty[si.itemId] = (soldQty[si.itemId] ?? 0) + si.quantity;
    }

    // Get actual inventory consumption movements for ingredients in date range
    const ingredientIds = itemsWithRecipe.flatMap((i) => i.recipeIngredients.map((r) => r.ingredientItemId));
    const consumptionMoves = await this.prisma.inventoryMovement.findMany({
      where: {
        item: { businessId },
        itemId: { in: ingredientIds },
        type: 'RECIPE_DEDUCTION',
        createdAt: { gte: startDate, lte: endDate },
        quantity: { lt: 0 },
      },
      select: { itemId: true, quantity: true },
    });

    const actualUsage: Record<string, number> = {};
    for (const m of consumptionMoves) {
      actualUsage[m.itemId] = (actualUsage[m.itemId] ?? 0) + Math.abs(m.quantity);
    }

    // Build variance rows per recipe item
    const rows = itemsWithRecipe.map((item) => {
      const qty = soldQty[item.id] ?? 0;
      const ingredients = item.recipeIngredients.map((ri) => {
        const planned = qty * ri.quantityGrams;
        const actual = actualUsage[ri.ingredientItemId] ?? null;
        const variance = actual !== null ? actual - planned : null;
        const variancePct = planned > 0 && actual !== null ? ((actual - planned) / planned) * 100 : null;
        return {
          ingredientName: ri.ingredientItem.name,
          ingredientId: ri.ingredientItemId,
          plannedGrams: planned,
          actualGrams: actual,
          varianceGrams: variance,
          variancePct: variancePct !== null ? Math.round(variancePct * 10) / 10 : null,
        };
      });
      return {
        itemId: item.id,
        itemName: item.name,
        soldQty: qty,
        ingredients,
      };
    });

    return rows.flatMap((r) => r.ingredients);
  }

  // ─── Bundle Profitability ──────────────────────────────────────────────────

  async bundleProfitabilityReport(businessId: string, startDate: Date, endDate: Date) {
    const bundleItems = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null },
      include: {
        bundleComponents: {
          include: { componentItem: true },
        },
      },
    });

    const bundles = bundleItems.filter((i) => i.bundleComponents.length > 0);
    if (bundles.length === 0) return [];

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: { businessId, status: { in: ['PAID', 'AMENDED'] }, createdAt: { gte: startDate, lte: endDate } },
        itemId: { in: bundles.map((b) => b.id) },
      },
      select: { itemId: true, quantity: true, unitPriceCents: true },
    });

    const rows = bundles.map((bundle) => {
      const sales = saleItems.filter((s) => s.itemId === bundle.id);
      const soldQty = sales.reduce((sum, s) => sum + s.quantity, 0);
      const revenueCents = sales.reduce((sum, s) => sum + s.quantity * s.unitPriceCents, 0);
      const componentCostCents = bundle.bundleComponents.reduce(
        (sum, bc) => sum + bc.quantity * (bc.componentItem.costPriceCents ?? 0),
        0,
      );
      const totalCostCents = soldQty * componentCostCents;
      const profitCents = revenueCents - totalCostCents;
      const marginPct = revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

      return {
        bundleId: bundle.id,
        bundleName: bundle.name,
        sold: soldQty,
        revenueCents,
        totalCostCents,
        profitCents,
        marginPct: Math.round(marginPct * 10) / 10,
      };
    });

    return rows;
  }

  // ─── Supplier Ledger ───────────────────────────────────────────────────────

  async supplierLedgerReport(businessId: string, startDate?: Date, endDate?: Date, supplierId?: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId, ...(supplierId && { id: supplierId }) },
      include: {
        purchaseOrders: {
          where: {
            ...(startDate || endDate ? {
              createdAt: {
                ...(startDate && { gte: startDate }),
                ...(endDate && { lte: endDate }),
              },
            } : {}),
          },
          include: { items: true, grns: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return suppliers.map((supplier) => {
      const pos = supplier.purchaseOrders;
      const totalOrderedCents = pos.reduce(
        (sum, po) => sum + po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0),
        0,
      );
      const receivedPOs = pos.filter((po) => po.status === 'RECEIVED');
      const pendingPOs = pos.filter((po) => ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status));
      const pendingValueCents = pendingPOs.reduce(
        (sum, po) => sum + po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0),
        0,
      );

      return {
        supplierId: supplier.id,
        supplierName: supplier.name,
        contact: supplier.contact,
        paymentTerms: supplier.paymentTerms,
        outstandingBalanceCents: supplier.outstandingBalanceCents,
        creditLimitCents: supplier.creditLimitCents,
        totalOrderedCents,
        totalOrders: pos.length,
        receivedOrders: receivedPOs.length,
        pendingOrders: pendingPOs.length,
        pendingValueCents,
        orders: pos.map((po) => ({
          id: po.id,
          poNumber: po.poNumber,
          status: po.status,
          createdAt: po.createdAt,
          expectedDelivery: po.expectedDelivery,
          valueCents: po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0),
          grnCount: po.grns.length,
        })),
      };
    });
  }

  // ─── Supplier Performance ──────────────────────────────────────────────────

  async supplierPerformanceReport(businessId: string, startDate: Date, endDate: Date) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId },
      include: {
        purchaseOrders: {
          where: { createdAt: { gte: startDate, lte: endDate } },
          include: { items: true, grns: true },
        },
      },
    });

    return suppliers
      .filter((s) => s.purchaseOrders.length > 0)
      .map((supplier) => {
        const pos = supplier.purchaseOrders;
        const totalOrders = pos.length;
        const receivedPOs = pos.filter((po) => po.status === 'RECEIVED');
        const cancelledPOs = pos.filter((po) => po.status === 'CANCELLED');

        // On-time: received before or on expectedDelivery
        const onTimePOs = receivedPOs.filter((po) => {
          if (!po.expectedDelivery || po.grns.length === 0) return false;
          const deliveredAt = po.grns[po.grns.length - 1].receivedAt;
          return deliveredAt <= po.expectedDelivery;
        });

        // Average lead time (days from PO creation to first GRN)
        const leadTimes = receivedPOs
          .filter((po) => po.grns.length > 0)
          .map((po) => {
            const firstGrn = po.grns.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())[0];
            return (firstGrn.receivedAt.getTime() - po.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          });

        const avgLeadTimeDays =
          leadTimes.length > 0
            ? Math.round((leadTimes.reduce((s, d) => s + d, 0) / leadTimes.length) * 10) / 10
            : null;

        const totalValueCents = pos.reduce(
          (sum, po) => sum + po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0),
          0,
        );

        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          totalOrders,
          receivedOrders: receivedPOs.length,
          cancelledOrders: cancelledPOs.length,
          onTimeDeliveries: onTimePOs.length,
          onTimeRate: receivedPOs.length > 0 ? Math.round((onTimePOs.length / receivedPOs.length) * 100) : null,
          avgLeadTimeDays,
          totalValueCents,
          fillRate: receivedPOs.length > 0 ? Math.round((receivedPOs.length / totalOrders) * 100) : 0,
        };
      });
  }

  // ── Customer Credit Book ───────────────────────────────────────────────────

  async creditBook(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      businessId,
      status: { in: ['CREDIT', 'PARTIAL_PAYMENT'] },
    };
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const creditSales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: { select: { amountCents: true, method: true } },
        items: { select: { totalCents: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = creditSales.map((sale) => {
      const paidCents = sale.payments.reduce((s, p) => s + p.amountCents, 0);
      const outstandingCents = sale.totalCents - paidCents;
      const daysSince = Math.floor((Date.now() - sale.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      return {
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        date: sale.createdAt,
        customerId: sale.customerId,
        customerName: sale.customer?.name ?? 'Walk-in',
        customerPhone: sale.customer?.phone ?? null,
        totalCents: sale.totalCents,
        paidCents,
        outstandingCents,
        daysSince,
        agingBucket:
          daysSince <= 30 ? '0-30 days' :
          daysSince <= 60 ? '31-60 days' :
          daysSince <= 90 ? '61-90 days' : '90+ days',
      };
    });

    const totalOutstandingCents = rows.reduce((s, r) => s + r.outstandingCents, 0);
    const uniqueDebtors = new Set(rows.map((r) => r.customerId)).size;

    return {
      rows,
      summary: {
        totalOutstandingCents,
        uniqueDebtors,
        totalCreditSales: rows.length,
      },
    };
  }

  // ─── Historical Stock Report ───────────────────────────────────────────────

  async historicalStockReport(businessId: string, asOfDate: Date, storeId?: string) {
    const items = await this.prisma.item.findMany({
      where: { businessId, ...(storeId && { storeId }), trackStock: true, deletedAt: null },
      select: { id: true, name: true, category: true, costPriceCents: true, barcode: true },
    });

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
        createdAt: { lte: asOfDate },
        itemId: { in: items.map((i) => i.id) },
      },
      select: { itemId: true, quantity: true },
    });

    const qtyByItem: Record<string, number> = {};
    for (const m of movements) {
      qtyByItem[m.itemId] = (qtyByItem[m.itemId] ?? 0) + m.quantity;
    }

    const rows = items.map((item) => {
      const qty = qtyByItem[item.id] ?? 0;
      return {
        itemId: item.id,
        name: item.name,
        category: item.category ?? '',
        barcode: item.barcode ?? '',
        quantity: qty,
        costPriceCents: item.costPriceCents ?? 0,
        valueCents: qty > 0 ? qty * (item.costPriceCents ?? 0) : 0,
      };
    }).filter((r) => r.quantity >= 0);

    return {
      asOfDate,
      items: rows,
      totalValueCents: rows.reduce((s, r) => s + r.valueCents, 0),
      totalItems: rows.length,
    };
  }

  // ─── Layaway Book Report ───────────────────────────────────────────────────

  async layawayBook(businessId: string, storeId?: string, startDate?: Date, endDate?: Date, status?: string) {
    const layaways = await this.prisma.layaway.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
        ...(status && { status }),
        ...(startDate || endDate ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      include: {
        customer: { select: { name: true, phone: true } },
        payments: { select: { amountCents: true, method: true, createdAt: true } },
        sale: { select: { receiptNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = layaways.map((lay) => ({
      id: lay.id,
      customerId: lay.customerId,
      customerName: lay.customer.name,
      customerPhone: lay.customer.phone ?? '',
      status: lay.status,
      totalCents: lay.totalCents,
      paidCents: lay.paidCents,
      remainingCents: lay.remainingCents,
      paymentCount: lay.payments.length,
      lastPaymentAt: lay.payments.length > 0
        ? lay.payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt
        : null,
      receiptNumber: lay.sale?.receiptNumber ?? null,
      createdAt: lay.createdAt,
      updatedAt: lay.updatedAt,
      daysSinceCreated: Math.floor((Date.now() - lay.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    return {
      rows,
      summary: {
        totalValueCents: rows.reduce((s, r) => s + r.totalCents, 0),
        totalPaidCents: rows.reduce((s, r) => s + r.paidCents, 0),
        totalRemainingCents: rows.reduce((s, r) => s + r.remainingCents, 0),
        activeCount: rows.filter((r) => r.status === 'ACTIVE').length,
        completedCount: rows.filter((r) => r.status === 'COMPLETED').length,
        count: rows.length,
      },
    };
  }

  // ─── Proforma Pipeline Report ──────────────────────────────────────────────

  async proformaPipeline(businessId: string, storeId?: string) {
    const proformas = await this.prisma.sale.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
        type: 'PROFORMA',
      },
      include: {
        items: { select: { name: true, quantity: true, unitPriceCents: true, totalCents: true } },
        customer: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const rows = proformas.map((p) => {
      const isExpired = p.proformaValidUntil ? p.proformaValidUntil < now && p.status !== 'PAID' : false;
      const daysRemaining = p.proformaValidUntil
        ? Math.ceil((p.proformaValidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        id: p.id,
        receiptNumber: p.receiptNumber,
        status: isExpired ? 'EXPIRED' : p.status,
        customerName: p.customerName ?? p.customer?.name ?? 'Walk-in',
        customerPhone: p.customerPhone ?? p.customer?.phone ?? '',
        totalCents: p.totalCents,
        itemCount: p.items.length,
        items: p.items,
        createdAt: p.createdAt,
        validUntil: p.proformaValidUntil,
        daysRemaining,
        isExpired,
        isUrgent: daysRemaining !== null && daysRemaining <= 3 && !isExpired,
      };
    });

    return {
      rows,
      summary: {
        total: rows.length,
        active: rows.filter((r) => r.status === 'DRAFT').length,
        expired: rows.filter((r) => r.status === 'EXPIRED').length,
        converted: rows.filter((r) => r.status === 'PAID').length,
        totalValueCents: rows.filter((r) => r.status !== 'PAID').reduce((s, r) => s + r.totalCents, 0),
        pipelineValueCents: rows.filter((r) => r.status === 'DRAFT').reduce((s, r) => s + r.totalCents, 0),
      },
    };
  }

  // ─── Serial Number Registry ────────────────────────────────────────────────

  async serialRegistry(businessId: string, storeId?: string, status?: string, itemId?: string) {
    const serials = await this.prisma.serialRecord.findMany({
      where: {
        ...(status && { status }),
        ...(itemId && { itemId }),
        item: { businessId, ...(storeId && { storeId }), deletedAt: null },
      },
      include: {
        item: { select: { name: true, category: true, barcode: true } },
        sale: { select: { receiptNumber: true, createdAt: true, customerName: true, customerPhone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      rows: serials.map((s) => ({
        id: s.id,
        serialNumber: s.serialNumber,
        status: s.status,
        itemId: s.itemId,
        itemName: s.item.name,
        category: s.item.category ?? '',
        itemBarcode: s.item.barcode ?? '',
        saleReceiptNumber: s.sale?.receiptNumber ?? null,
        soldAt: s.sale?.createdAt ?? null,
        customerName: s.sale?.customerName ?? null,
        customerPhone: s.sale?.customerPhone ?? null,
        createdAt: s.createdAt,
      })),
      summary: {
        total: serials.length,
        available: serials.filter((s) => s.status === 'AVAILABLE').length,
        sold: serials.filter((s) => s.status === 'SOLD').length,
        reserved: serials.filter((s) => s.status === 'RESERVED').length,
      },
    };
  }

  // ─── KRA Formatted Export ──────────────────────────────────────────────────

  async kraFormattedExport(businessId: string, startDate: Date, endDate: Date) {
    const [business, sales] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true, taxType: true },
      }),
      this.prisma.sale.findMany({
        where: { businessId, status: { in: ['PAID', 'AMENDED'] }, createdAt: { gte: startDate, lte: endDate } },
        include: {
          items: { select: { name: true, quantity: true, unitPriceCents: true, totalCents: true } },
          payments: { select: { method: true, amountCents: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      exportDate: new Date().toISOString(),
      formatVersion: '1.0',
      businessName: business?.name ?? '',
      businessId,
      taxType: business?.taxType ?? 'VAT',
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      summary: {
        totalTransactions: sales.length,
        totalRevenueCents: sales.reduce((s, sale) => s + sale.totalCents, 0),
        totalVatCents: sales.reduce((s, sale) => s + recalcVat(sale.subtotalCents, sale.discountCents), 0),
        totalTotCents: sales.reduce((s, sale) => s + recalcTot(sale.subtotalCents, sale.discountCents), 0),
        etimsSubmittedCount: sales.filter((s) => s.etimsSubmitted).length,
        etimsPendingCount: sales.filter((s) => !s.etimsSubmitted).length,
      },
      transactions: sales.map((sale) => {
        const vatCents = recalcVat(sale.subtotalCents, sale.discountCents);
        const totCents = sale.totCents > 0 ? recalcTot(sale.subtotalCents, sale.discountCents) : 0;
        return {
        receiptNumber: sale.receiptNumber,
        date: sale.createdAt.toISOString(),
        etimsControlNumber: sale.etimsControlNumber ?? null,
        etimsSubmitted: sale.etimsSubmitted,
        subtotalCents: sale.subtotalCents,
        netCents: sale.subtotalCents - sale.discountCents - vatCents - totCents,
        vatCents,
        totCents,
        serviceChargeCents: sale.serviceChargeCents,
        discountCents: sale.discountCents,
        totalCents: sale.totalCents,
        items: sale.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          totalCents: i.totalCents,
        })),
        payments: sale.payments.map((p) => ({
          method: p.method,
          amountCents: p.amountCents,
        })),
        };
      }),
    };
  }

  // ─── Tamper-Evident Audit Log Export ──────────────────────────────────────

  async auditLogExport(businessId: string, startDate?: Date, endDate?: Date) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        businessId,
        ...(startDate || endDate ? {
          createdAt: {
            ...(startDate && { gte: startDate }),
            ...(endDate && { lte: endDate }),
          },
        } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    // Verify chain integrity
    let chainIntact = true;
    const entries = logs.map((log, i) => {
      const chainValid = i === 0
        ? log.previousHash === '0'.repeat(64)
        : log.previousHash === logs[i - 1].hash;
      if (!chainValid) chainIntact = false;
      return {
        id: log.id,
        sequence: i + 1,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        actor: log.actor,
        actorType: log.actorType,
        source: log.source,
        before: log.before ? JSON.parse(log.before) : null,
        after: log.after ? JSON.parse(log.after) : null,
        createdAt: log.createdAt,
        previousHash: log.previousHash,
        hash: log.hash,
        chainValid,
      };
    });

    return {
      exportDate: new Date().toISOString(),
      businessId,
      chainIntact,
      integrityStatus: chainIntact ? 'INTACT' : 'TAMPERED',
      entriesCount: logs.length,
      entries,
    };
  }

  // ─── GRN Discrepancy Report ────────────────────────────────────────────────

  async grnDiscrepancyReport(businessId: string, startDate?: Date, endDate?: Date, supplierId?: string) {
    const grns = await this.prisma.gRN.findMany({
      where: {
        po: {
          businessId,
          ...(supplierId && { supplierId }),
          ...(startDate || endDate ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          } : {}),
        },
      },
      include: {
        items: true,
        po: {
          include: {
            supplier: { select: { name: true } },
            items: true,
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });

    const rows: any[] = [];
    for (const grn of grns) {
      for (const grnItem of grn.items) {
        const poItem = grn.po.items.find((pi) => pi.id === grnItem.poItemId);
        if (!poItem) continue;

        const ordered = poItem.quantityOrdered;
        const received = grnItem.quantityReceived;
        const variance = received - ordered;
        const variancePct = ordered > 0 ? (variance / ordered) * 100 : 0;

        rows.push({
          grnId: grn.id,
          receivedAt: grn.receivedAt,
          poNumber: grn.po.poNumber,
          supplierName: grn.po.supplier.name,
          itemId: poItem.itemId,
          quantityOrdered: ordered,
          quantityReceived: received,
          variance,
          variancePct: Math.round(variancePct * 10) / 10,
          hasDiscrepancy: variance !== 0,
          discrepancyType: variance < 0 ? 'SHORT' : variance > 0 ? 'OVER' : 'MATCH',
          batchLotNumber: grnItem.batchLotNumber ?? null,
          agreedPriceCents: poItem.agreedPriceCents,
          varianceValueCents: Math.abs(variance) * poItem.agreedPriceCents,
        });
      }
    }

    const discrepancies = rows.filter((r) => r.hasDiscrepancy);

    return {
      rows,
      summary: {
        totalLines: rows.length,
        discrepancyCount: discrepancies.length,
        shortDeliveries: discrepancies.filter((r) => r.discrepancyType === 'SHORT').length,
        overDeliveries: discrepancies.filter((r) => r.discrepancyType === 'OVER').length,
        totalVarianceValueCents: discrepancies.reduce((s, r) => s + r.varianceValueCents, 0),
        discrepancyRate: rows.length > 0 ? Math.round((discrepancies.length / rows.length) * 100) : 0,
      },
    };
  }

  // ─── Full Data Export ──────────────────────────────────────────────────────

  async fullDataExport(businessId: string) {
    const [business, stores, items, sales, customers, expenses, suppliers, employees] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, taxType: true, createdAt: true },
      }),
      this.prisma.store.findMany({ where: { businessId } }),
      this.prisma.item.findMany({
        where: { businessId, deletedAt: null },
        select: { id: true, name: true, category: true, type: true, retailPriceCents: true, costPriceCents: true, barcode: true },
      }),
      this.prisma.sale.findMany({
        where: { businessId, status: { in: ['PAID', 'AMENDED'] } },
        select: {
          id: true, receiptNumber: true, createdAt: true,
          subtotalCents: true, vatCents: true, totCents: true, totalCents: true,
          etimsSubmitted: true, etimsControlNumber: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      }),
      this.prisma.customer.findMany({ where: { businessId } }),
      this.prisma.expense.findMany({
        where: { businessId },
        select: { id: true, category: true, description: true, amountCents: true, createdAt: true, approvalStatus: true },
      }),
      this.prisma.supplier.findMany({ where: { businessId } }),
      this.prisma.employee.findMany({
        where: { businessId },
        include: { user: { select: { name: true, email: true, role: true } } },
      }),
    ]);

    return {
      exportDate: new Date().toISOString(),
      formatVersion: '1.0',
      business,
      totals: {
        stores: stores.length,
        items: items.length,
        sales: sales.length,
        customers: customers.length,
        expenses: expenses.length,
        suppliers: suppliers.length,
        employees: employees.length,
      },
      data: { stores, items, sales, customers, expenses, suppliers, employees },
    };
  }

  // ─── Cross-Store Owner Dashboard ──────────────────────────────────────────────

  async crossStoreDashboard(businessId: string, startDate?: Date, endDate?: Date) {
    const stores = await this.prisma.store.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });

    const dateFilter = startDate || endDate
      ? {
          ...(startDate && { gte: startDate }),
          ...(endDate && { lte: endDate }),
        }
      : undefined;

    const storeStats = await Promise.all(
      stores.map(async (store) => {
        const where: any = { businessId, storeId: store.id, status: { in: ['PAID', 'AMENDED'] } };
        if (dateFilter) where.createdAt = dateFilter;

        const [agg, topItems, stockValue] = await Promise.all([
          this.prisma.sale.aggregate({
            where,
            _sum: { totalCents: true, vatCents: true },
            _count: true,
          }),
          this.prisma.saleItem.groupBy({
            by: ['itemId', 'name'],
            where: { sale: where },
            _sum: { quantity: true, totalCents: true },
            orderBy: { _sum: { totalCents: 'desc' } },
            take: 5,
          }),
          this.prisma.inventoryMovement.groupBy({
            by: ['itemId'],
            where: { businessId, storeId: store.id },
            _sum: { quantity: true },
          }),
        ]);

        return {
          storeId: store.id,
          storeName: store.name,
          storeCode: store.storeCode,
          totalRevenueCents: agg._sum.totalCents || 0,
          totalVatCents: agg._sum.vatCents || 0,
          transactionCount: agg._count,
          topItems: topItems.map((i) => ({
            itemId: i.itemId,
            name: i.name,
            qtySold: i._sum.quantity || 0,
            revenueCents: i._sum.totalCents || 0,
          })),
          totalStockLines: stockValue.filter((s) => (s._sum.quantity || 0) > 0).length,
        };
      }),
    );

    const grandRevenue = storeStats.reduce((s, st) => s + st.totalRevenueCents, 0);
    const grandTxns = storeStats.reduce((s, st) => s + st.transactionCount, 0);

    return {
      stores: storeStats,
      summary: {
        totalRevenueCents: grandRevenue,
        totalTransactions: grandTxns,
        storeCount: stores.length,
      },
    };
  }

  // ─── Supplier Ageing Report ────────────────────────────────────────────────

  async supplierAgeingReport(businessId: string, asOfDate?: Date) {
    const now = asOfDate ?? new Date();

    const suppliers = await this.prisma.supplier.findMany({
      where: { businessId },
      include: {
        purchaseOrders: {
          where: { status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] } },
          include: { items: true },
        },
      },
    });

    const ageRow = (dueDaysOverdue: number) => {
      if (dueDaysOverdue <= 0) return 'current';
      if (dueDaysOverdue <= 30) return '1-30';
      if (dueDaysOverdue <= 60) return '31-60';
      if (dueDaysOverdue <= 90) return '61-90';
      return '90plus';
    };

    const rows = suppliers
      .filter((s) => s.purchaseOrders.length > 0)
      .map((supplier) => {
        const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90plus': 0 };

        for (const po of supplier.purchaseOrders) {
          const valueCents = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);
          const dueDate = po.expectedDelivery ?? new Date(po.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const bucket = ageRow(daysOverdue);
          buckets[bucket] += valueCents;
        }

        const totalOutstandingCents = Object.values(buckets).reduce((s, v) => s + v, 0);

        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          contact: supplier.contact,
          paymentTerms: supplier.paymentTerms,
          totalOutstandingCents,
          currentCents: buckets['current'],
          days1to30Cents: buckets['1-30'],
          days31to60Cents: buckets['31-60'],
          days61to90Cents: buckets['61-90'],
          days90plusCents: buckets['90plus'],
          overdueOrderCount: supplier.purchaseOrders.filter((po) => {
            const dueDate = po.expectedDelivery ?? new Date(po.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
            return now > dueDate;
          }).length,
          totalOrderCount: supplier.purchaseOrders.length,
        };
      })
      .filter((r) => r.totalOutstandingCents > 0)
      .sort((a, b) => b.totalOutstandingCents - a.totalOutstandingCents);

    const summary = {
      totalSuppliers: rows.length,
      totalOutstandingCents: rows.reduce((s, r) => s + r.totalOutstandingCents, 0),
      currentCents: rows.reduce((s, r) => s + r.currentCents, 0),
      days1to30Cents: rows.reduce((s, r) => s + r.days1to30Cents, 0),
      days31to60Cents: rows.reduce((s, r) => s + r.days31to60Cents, 0),
      days61to90Cents: rows.reduce((s, r) => s + r.days61to90Cents, 0),
      days90plusCents: rows.reduce((s, r) => s + r.days90plusCents, 0),
    };

    return { rows, summary, asOfDate: now.toISOString() };
  }

  // ─── Employee Sales Detailed Report ────────────────────────────────────────

  async employeeSalesReport(
    businessId: string,
    storeId?: string,
    employeeId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
    if (storeId) where.storeId = storeId;
    if (employeeId) where.cashierId = employeeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, category: true } },
          },
        },
        payments: {
          where: { method: 'MPESA' },
          select: { id: true, amountCents: true, reference: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by cashier
    const byEmployee: Record<string, {
      employeeId: string;
      employeeName: string;
      role: string;
      salesCount: number;
      totalCents: number;
      categories: Record<string, {
        name: string;
        items: Record<string, { itemName: string; qty: number; totalCents: number }>;
        subtotalCents: number;
      }>;
      mpesaPayments: Array<{ saleReceiptNumber: string | null; amountCents: number; mpesaRef: string | null | undefined; createdAt: Date }>;
      mpesaTotalCents: number;
    }> = {};

    for (const sale of sales) {
      if (!sale.cashier) continue;
      const empId = sale.cashier.id;

      if (!byEmployee[empId]) {
        byEmployee[empId] = {
          employeeId: empId,
          employeeName: sale.cashier.name,
          role: sale.cashier.role,
          salesCount: 0,
          totalCents: 0,
          categories: {},
          mpesaPayments: [],
          mpesaTotalCents: 0,
        };
      }

      const emp = byEmployee[empId];
      emp.salesCount++;
      emp.totalCents += sale.totalCents;

      // Group sale items by category
      for (const si of sale.items) {
        const cat = si.item?.category ?? 'Uncategorised';
        if (!emp.categories[cat]) {
          emp.categories[cat] = { name: cat, items: {}, subtotalCents: 0 };
        }
        const catGroup = emp.categories[cat];
        const itemName = si.item?.name ?? si.name;
        if (!catGroup.items[si.itemId ?? itemName]) {
          catGroup.items[si.itemId ?? itemName] = { itemName, qty: 0, totalCents: 0 };
        }
        catGroup.items[si.itemId ?? itemName].qty += si.quantity;
        catGroup.items[si.itemId ?? itemName].totalCents += si.totalCents;
        catGroup.subtotalCents += si.totalCents;
      }

      // Collect M-Pesa payments
      for (const pmt of sale.payments) {
        emp.mpesaPayments.push({
          saleReceiptNumber: (sale as any).receiptNumber ?? null,
          amountCents: pmt.amountCents,
          mpesaRef: pmt.reference ?? null,
          createdAt: pmt.createdAt,
        });
        emp.mpesaTotalCents += pmt.amountCents;
      }
    }

    // Flatten into serialisable array
    const rows = Object.values(byEmployee).map((emp) => ({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      role: emp.role,
      salesCount: emp.salesCount,
      totalCents: emp.totalCents,
      categories: Object.values(emp.categories).map((cat) => ({
        name: cat.name,
        subtotalCents: cat.subtotalCents,
        items: Object.values(cat.items),
      })).sort((a, b) => b.subtotalCents - a.subtotalCents),
      mpesaPayments: emp.mpesaPayments.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
      mpesaTotalCents: emp.mpesaTotalCents,
    })).sort((a, b) => b.totalCents - a.totalCents);

    const summary = {
      totalEmployees: rows.length,
      totalSales: rows.reduce((s, r) => s + r.salesCount, 0),
      totalRevenueCents: rows.reduce((s, r) => s + r.totalCents, 0),
      totalMpesaCents: rows.reduce((s, r) => s + r.mpesaTotalCents, 0),
    };

    return { rows, summary };
  }

  // ── Item Summary Report ────────────────────────────────────────────────────────
  async itemSummaryReport(
    businessId: string,
    storeId?: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const saleWhere: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
    if (storeId) saleWhere.storeId = storeId;
    if (startDate || endDate) {
      saleWhere.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const saleItems = await this.prisma.saleItem.findMany({
      where: { sale: saleWhere },
      include: {
        item: { select: { name: true, category: true } },
      },
    });

    // Group by category → item name
    const categoryMap: Record<string, {
      name: string;
      totalCents: number;
      totalQty: number;
      items: Record<string, { name: string; qty: number; totalCents: number }>;
    }> = {};

    for (const si of saleItems) {
      const cat = si.item?.category || 'Uncategorised';
      const itemName = si.item?.name || 'Unknown';
      const lineCents = si.totalCents;

      if (!categoryMap[cat]) {
        categoryMap[cat] = { name: cat, totalCents: 0, totalQty: 0, items: {} };
      }
      if (!categoryMap[cat].items[itemName]) {
        categoryMap[cat].items[itemName] = { name: itemName, qty: 0, totalCents: 0 };
      }
      categoryMap[cat].items[itemName].qty += si.quantity;
      categoryMap[cat].items[itemName].totalCents += lineCents;
      categoryMap[cat].totalCents += lineCents;
      categoryMap[cat].totalQty += si.quantity;
    }

    const categories = Object.values(categoryMap)
      .map((cat) => ({
        name: cat.name,
        totalCents: cat.totalCents,
        totalQty: cat.totalQty,
        items: Object.values(cat.items).sort((a, b) => b.totalCents - a.totalCents),
      }))
      .sort((a, b) => b.totalCents - a.totalCents);

    const grandTotalCents = categories.reduce((s, c) => s + c.totalCents, 0);
    const grandTotalQty = categories.reduce((s, c) => s + c.totalQty, 0);

    return { categories, grandTotalCents, grandTotalQty };
  }

  // ─── Expiry Report ─────────────────────────────────────────────────────────

  async getExpiryReport(businessId: string, storeId: string | undefined, days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);

    const batches = await this.prisma.batch.findMany({
      where: {
        item: { businessId },
        expiryDate: { not: null, lte: cutoffDate },
        status: { not: 'RECALLED' },
        quantityRemaining: { gt: 0 },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        item: { select: { name: true, category: true, barcode: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const today = new Date();
    return batches.map(b => {
      const daysRemaining = b.expiryDate
        ? Math.ceil((b.expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        batchId: b.id,
        lotNumber: b.lotNumber,
        itemName: b.item.name,
        itemCategory: b.item.category,
        barcode: b.item.barcode,
        expiryDate: b.expiryDate,
        daysRemaining,
        quantityRemaining: b.quantityRemaining,
        storeId: b.storeId,
        status: daysRemaining !== null && daysRemaining <= 0
          ? 'EXPIRED'
          : daysRemaining !== null && daysRemaining <= 7
            ? 'CRITICAL'
            : daysRemaining !== null && daysRemaining <= 30
              ? 'WARNING'
              : 'OK',
      };
    });
  }
}
