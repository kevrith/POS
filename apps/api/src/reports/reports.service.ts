import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CashDrawerService } from '../cash-drawer/cash-drawer.service';

/**
 * Repair the magnitude of historically mis-stored tax WITHOUT inventing tax
 * that was never charged.
 *
 * Old sales stored VAT with an exclusive formula (base × 0.16) rather than the
 * inclusive one (base × 16/116), so the figure is wrong but non-zero. The fix
 * used to recompute unconditionally, which also fabricated VAT for businesses
 * on taxType NONE or TOT — a KES 20 sale with tax turned off reported KES 2.76
 * of VAT, and that figure fed the KRA VAT return.
 *
 * Gating on the stored value keeps the repair and drops the fabrication: a sale
 * that genuinely carried no VAT stored 0, and stays 0.
 */
function recalcVat(storedVatCents: number | null | undefined, subtotalCents: number, discountCents = 0): number {
  if (!storedVatCents || storedVatCents <= 0) return 0;
  const taxBase = Math.max(0, subtotalCents - discountCents);
  return Math.round(taxBase * 16 / 116);
}
function recalcTot(storedTotCents: number | null | undefined, subtotalCents: number, discountCents = 0): number {
  if (!storedTotCents || storedTotCents <= 0) return 0;
  const taxBase = Math.max(0, subtotalCents - discountCents);
  return Math.round(taxBase * 3 / 103);
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private cashDrawer: CashDrawerService,
  ) {}

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
      vatCents: recalcVat(s.vatCents, s.subtotalCents, s.discountCents),
      totCents: recalcTot(s.totCents, s.subtotalCents, s.discountCents),
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

  async vatReport(businessId: string, startDate: Date, endDate: Date, storeId?: string) {
    const rawSales = await this.prisma.sale.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
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
      vatCents: recalcVat(s.vatCents, s.subtotalCents, s.discountCents),
      netCents: Math.max(0, s.subtotalCents - s.discountCents) - recalcVat(s.vatCents, s.subtotalCents, s.discountCents),
    }));

    const totalVat = sales.reduce((sum, s) => sum + s.vatCents, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.totalCents, 0);
    const totalNet = sales.reduce((sum, s) => sum + s.netCents, 0);

    return { sales, totalVatCents: totalVat, totalSalesCents: totalSales, totalNetCents: totalNet };
  }

  async totReport(businessId: string, startDate: Date, endDate: Date, storeId?: string) {
    const rawSales = await this.prisma.sale.findMany({
      where: {
        businessId,
        ...(storeId && { storeId }),
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
      totCents: recalcTot(s.totCents, s.subtotalCents, s.discountCents),
    }));

    const totalTot = sales.reduce((sum, s) => sum + s.totCents, 0);
    const totalSales = sales.reduce((sum, s) => sum + s.totalCents, 0);

    return { sales, totalTotCents: totalTot, totalSalesCents: totalSales };
  }

  async vatReturn(businessId: string, startDate: Date, endDate: Date, storeId?: string) {
    const [rawSales, reclaimableExpenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          businessId,
          ...(storeId && { storeId }),
          status: { in: ['PAID', 'AMENDED'] },
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          receiptNumber: true,
          createdAt: true,
          subtotalCents: true,
          discountCents: true,
          totalCents: true,
          // Needed to tell a sale that carried VAT from one made with tax off.
          vatCents: true,
        },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId,
          vatReclaimable: true,
          approvalStatus: 'APPROVED',
          createdAt: { gte: startDate, lte: endDate },
        },
        select: {
          id: true,
          description: true,
          category: true,
          amountCents: true,
          createdAt: true,
        },
      }),
    ]);

    // Output VAT from sales (extracted inclusive 16/116)
    const salesWithVat = rawSales.map(s => {
      const vatCents = recalcVat(s.vatCents, s.subtotalCents, s.discountCents);
      return { ...s, vatCents };
    });

    const outputVatCents = salesWithVat.reduce((sum, s) => sum + s.vatCents, 0);
    const totalSalesCents = rawSales.reduce((sum, s) => sum + s.totalCents, 0);

    // Input VAT from reclaimable expenses (extracted inclusive 16/116)
    const expensesWithVat = reclaimableExpenses.map(e => ({
      ...e,
      vatCents: Math.round(e.amountCents * 16 / 116),
    }));
    const inputVatCents = expensesWithVat.reduce((sum, e) => sum + e.vatCents, 0);
    const netVatPayableCents = outputVatCents - inputVatCents;

    return {
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      outputVat: {
        totalCents: outputVatCents,
        totalSalesCents,
        salesCount: rawSales.length,
        sales: salesWithVat,
      },
      inputVat: {
        totalCents: inputVatCents,
        expensesCount: reclaimableExpenses.length,
        expenses: expensesWithVat,
      },
      netVatPayableCents,
    };
  }

  async stockValuation(businessId: string, storeId?: string) {
    // Fetch all tracked items for the business, filtering movements by store
    // (NOT items by storeId — items belong to their creation store but stock
    //  can be in any store via transfers)
    const items = await this.prisma.item.findMany({
      where: { businessId, trackStock: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        costPriceCents: true,
        movements: {
          where: storeId ? { storeId } : undefined,
          select: { quantity: true },
        },
      },
    });

    const valuation = items
      .map(item => {
        const quantity = item.movements.reduce((sum, m) => sum + m.quantity, 0);
        const valueCents = quantity * (item.costPriceCents || 0);
        return {
          itemId: item.id,
          name: item.name,
          quantity,
          costPriceCents: item.costPriceCents || 0,
          valueCents,
        };
      })
      // When scoped to a specific store, hide items with no stock there
      .filter(v => !storeId || v.quantity !== 0);

    const totalValueCents = valuation.reduce((sum, v) => sum + v.valueCents, 0);

    return { items: valuation, totalValueCents };
  }

  async stockTransfers(businessId: string, storeId?: string, status?: string, startDate?: Date, endDate?: Date) {
    const transfers = await this.prisma.storeTransfer.findMany({
      where: {
        businessId,
        ...(storeId && { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] }),
        ...(status && { status }),
        ...(startDate && endDate && { createdAt: { gte: startDate, lte: endDate } }),
      },
      include: {
        items: {
          include: {
            transfer: false,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // Enrich with store + item names
    const storeIds = [...new Set([...transfers.map(t => t.fromStoreId), ...transfers.map(t => t.toStoreId)])];
    const itemIds  = [...new Set(transfers.flatMap(t => t.items.map(i => i.itemId)))];
    const userIds  = [...new Set([...transfers.map(t => t.initiatedBy), ...transfers.map(t => t.receivedBy).filter(Boolean) as string[]])];

    const [stores, itemsList, users] = await Promise.all([
      this.prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }),
      this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    ]);

    const storeMap = new Map(stores.map(s => [s.id, s.name]));
    const itemMap  = new Map(itemsList.map(i => [i.id, i.name]));
    const userMap  = new Map(users.map(u => [u.id, u.name]));

    const enriched = transfers.map(t => ({
      id: t.id,
      status: t.status,
      fromStoreId: t.fromStoreId,
      fromStoreName: storeMap.get(t.fromStoreId) ?? t.fromStoreId,
      toStoreId: t.toStoreId,
      toStoreName: storeMap.get(t.toStoreId) ?? t.toStoreId,
      initiatedBy: t.initiatedBy,
      initiatedByName: userMap.get(t.initiatedBy) ?? t.initiatedBy,
      receivedBy: t.receivedBy ?? null,
      receivedByName: t.receivedBy ? (userMap.get(t.receivedBy) ?? t.receivedBy) : null,
      notes: t.notes ?? null,
      createdAt: t.createdAt,
      completedAt: null,
      items: t.items.map(i => ({
        itemId: i.itemId,
        itemName: itemMap.get(i.itemId) ?? i.itemId,
        quantity: i.quantity,
      })),
    }));

    const pending = enriched.filter(t => t.status === 'PENDING').length;
    const completed = enriched.filter(t => t.status === 'COMPLETED').length;
    const cancelled = enriched.filter(t => t.status === 'CANCELLED').length;
    const inTransitToStore = storeId
      ? enriched.filter(t => t.toStoreId === storeId && t.status === 'PENDING').length
      : 0;

    return {
      transfers: enriched,
      summary: { total: enriched.length, pending, completed, cancelled, inTransitToStore },
    };
  }

  async profitAndLoss(businessId: string, startDate: Date, endDate: Date, storeId?: string) {
    const [sales, expenses] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          businessId,
          ...(storeId && { storeId }),
          status: { in: ['PAID', 'AMENDED'] },
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { subtotalCents: true, totalCents: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          businessId,
          ...(storeId && { storeId }),
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
      return { error: 'No open cash drawer session', session: null, summary: null };
    }

    // Same builder the drawer screen uses, so an X-report and the live session
    // totals can never disagree.
    const summary = await this.cashDrawer.buildSummary(session);

    return {
      session,
      summary,
      // Flattened for callers that read the totals directly.
      ...summary,
      sessionId: session.id,
      openedAt: session.openedAt,
      openingBalanceCents: session.openingBalanceCents,
      expectedCashCents: summary.expectedClosingCents,
      generatedAt: new Date().toISOString(),
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

  async expenseReport(businessId: string, storeId?: string, startDate?: Date, endDate?: Date, category?: string) {
    const where: any = { businessId, approvalStatus: 'APPROVED' };
    if (storeId) where.storeId = storeId;
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

  async commissionReport(businessId: string, storeId?: string, employeeId?: string, startDate?: Date, endDate?: Date) {
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

  async attendanceReport(businessId: string, storeId?: string, employeeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      employee: { businessId },
    };
    if (storeId) where.storeId = storeId;
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
        totalValueCents: totalOrderedCents,
        poCount: pos.length,
        receivedCount: receivedPOs.length,
        pendingCount: pendingPOs.length,
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
    // Fetch all items for the business — stock location is tracked by movement.storeId,
    // not item.storeId (which is just the creation store).
    const items = await this.prisma.item.findMany({
      where: { businessId, trackStock: true, deletedAt: null },
      select: { id: true, name: true, category: true, costPriceCents: true, retailPriceCents: true, barcode: true },
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
      const costPriceCents = item.costPriceCents ?? 0;
      const retailPriceCents = item.retailPriceCents ?? 0;
      return {
        itemId: item.id,
        name: item.name,
        category: item.category ?? '',
        barcode: item.barcode ?? '',
        quantity: qty,
        costPriceCents,
        valueCents: qty > 0 ? qty * costPriceCents : 0,
        retailPriceCents,
        retailValueCents: qty > 0 ? qty * retailPriceCents : 0,
      };
    // When store-scoped, hide items with no movements at that store
    }).filter((r) => storeId ? r.quantity !== 0 : r.quantity >= 0);

    return {
      asOfDate,
      items: rows,
      totalValueCents: rows.reduce((s, r) => s + r.valueCents, 0),
      totalRetailValueCents: rows.reduce((s, r) => s + r.retailValueCents, 0),
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
        // Filter by businessId on the item; if storeId provided, show serials sold at that store OR still available
        item: { businessId, deletedAt: null },
        ...(storeId && { OR: [{ AND: [{ saleId: { not: null } }, { sale: { storeId } }] }, { saleId: null }] }),
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
        totalVatCents: sales.reduce((s, sale) => s + recalcVat(sale.vatCents, sale.subtotalCents, sale.discountCents), 0),
        totalTotCents: sales.reduce((s, sale) => s + recalcTot(sale.totCents, sale.subtotalCents, sale.discountCents), 0),
        etimsSubmittedCount: sales.filter((s) => s.etimsSubmitted).length,
        etimsPendingCount: sales.filter((s) => !s.etimsSubmitted).length,
      },
      transactions: sales.map((sale) => {
        const vatCents = recalcVat(sale.vatCents, sale.subtotalCents, sale.discountCents);
        const totCents = recalcTot(sale.totCents, sale.subtotalCents, sale.discountCents);
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

  async getVatItaxExport(businessId: string, periodStart: string, periodEnd: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: 'COMPLETED',
        createdAt: { gte: new Date(periodStart), lte: new Date(periodEnd) },
      },
      include: { items: true },
    });

    const rows: string[] = ['PIN,InvoiceNo,Date,CustomerName,TaxableValueKES,VATKES'];
    for (const sale of sales) {
      const taxableKES = (sale.subtotalCents / 100).toFixed(2);
      const vatKES = (sale.vatCents / 100).toFixed(2);
      rows.push([
        'A000000000A', // business PIN placeholder
        sale.receiptNumber ?? sale.id,
        sale.createdAt.toISOString().split('T')[0],
        ((sale as any).customerName ?? 'Cash Sale').replace(/,/g, ' '),
        taxableKES,
        vatKES,
      ].join(','));
    }
    return rows.join('\n');
  }

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
      totalItemsSold: number;
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
          totalItemsSold: 0,
          categories: {},
          mpesaPayments: [],
          mpesaTotalCents: 0,
        };
      }

      const emp = byEmployee[empId];
      emp.salesCount++;
      emp.totalCents += sale.totalCents;
      emp.totalItemsSold += sale.items.reduce((sum, si) => sum + si.quantity, 0);

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
      totalItemsSold: emp.totalItemsSold,
      avgItemsPerTransaction: emp.salesCount > 0 ? Math.round((emp.totalItemsSold / emp.salesCount) * 100) / 100 : 0,
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

    const totalItemsSold = rows.reduce((s, r) => s + r.totalItemsSold, 0);
    const totalSales = rows.reduce((s, r) => s + r.salesCount, 0);
    const summary = {
      totalEmployees: rows.length,
      totalSales,
      totalRevenueCents: rows.reduce((s, r) => s + r.totalCents, 0),
      totalMpesaCents: rows.reduce((s, r) => s + r.mpesaTotalCents, 0),
      totalItemsSold,
      avgItemsPerTransaction: totalSales > 0 ? Math.round((totalItemsSold / totalSales) * 100) / 100 : 0,
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

  // ─── Dead Stock Report ─────────────────────────────────────────────────────
  async deadStockReport(businessId: string, storeId?: string, daysThreshold = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysThreshold);

    // Fetch items by businessId — stock location is in movement.storeId, NOT item.storeId
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        deletedAt: null,
        isActive: true,
        trackStock: true,
      },
      include: {
        // Recent movements (any type) at this store in the threshold window
        movements: {
          where: {
            ...(storeId ? { storeId } : {}),
            createdAt: { gte: cutoff },
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const deadItems = [];
    for (const item of items) {
      // Check current stock level at this store (movement-based)
      const stockAgg = await this.prisma.inventoryMovement.aggregate({
        where: { itemId: item.id, ...(storeId ? { storeId } : {}) },
        _sum: { quantity: true },
      });
      const stock = stockAgg._sum.quantity ?? 0;
      if (stock <= 0) continue; // no stock at this store, nothing to report

      // Last movement date at this store
      const lastMovement = await this.prisma.inventoryMovement.findFirst({
        where: { itemId: item.id, ...(storeId ? { storeId } : {}) },
        orderBy: { createdAt: 'desc' },
      });

      const hasRecentActivity = item.movements.length > 0;
      if (!hasRecentActivity) {
        const lastSold = lastMovement?.createdAt;
        const daysSinceActivity = lastSold
          ? Math.floor((Date.now() - lastSold.getTime()) / 86400000)
          : null;
        deadItems.push({
          itemId: item.id,
          name: item.name,
          category: item.category ?? 'Uncategorised',
          stock,
          costPriceCents: item.costPriceCents ?? 0,
          stockValueCents: stock * (item.costPriceCents ?? 0),
          daysSinceLastSale: daysSinceActivity,
          lastSaleDate: lastSold?.toISOString() ?? null,
        });
      }
    }

    const totalValueCents = deadItems.reduce((s, i) => s + i.stockValueCents, 0);
    return {
      items: deadItems.sort((a, b) => b.stockValueCents - a.stockValueCents),
      totalItems: deadItems.length,
      totalValueCents,
      daysThreshold,
    };
  }

  // ─── Gross Margin by Category ──────────────────────────────────────────────
  async grossMarginByCategory(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
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
        item: { select: { name: true, category: true, costPriceCents: true } },
      },
    });

    const categoryMap: Record<string, {
      name: string;
      revenueCents: number;
      costCents: number;
      qty: number;
      items: Record<string, { name: string; qty: number; revenueCents: number; costCents: number }>;
    }> = {};

    for (const si of saleItems) {
      const cat = si.item?.category || 'Uncategorised';
      const itemName = si.item?.name || 'Unknown';
      const costPerUnit = si.item?.costPriceCents ?? 0;
      const lineCost = costPerUnit * si.quantity;

      if (!categoryMap[cat]) {
        categoryMap[cat] = { name: cat, revenueCents: 0, costCents: 0, qty: 0, items: {} };
      }
      if (!categoryMap[cat].items[itemName]) {
        categoryMap[cat].items[itemName] = { name: itemName, qty: 0, revenueCents: 0, costCents: 0 };
      }
      categoryMap[cat].items[itemName].qty += si.quantity;
      categoryMap[cat].items[itemName].revenueCents += si.totalCents;
      categoryMap[cat].items[itemName].costCents += lineCost;
      categoryMap[cat].revenueCents += si.totalCents;
      categoryMap[cat].costCents += lineCost;
      categoryMap[cat].qty += si.quantity;
    }

    const categories = Object.values(categoryMap).map((cat) => ({
      name: cat.name,
      revenueCents: cat.revenueCents,
      costCents: cat.costCents,
      grossProfitCents: cat.revenueCents - cat.costCents,
      marginPct: cat.revenueCents > 0 ? ((cat.revenueCents - cat.costCents) / cat.revenueCents) * 100 : 0,
      qty: cat.qty,
      items: Object.values(cat.items)
        .map((i) => ({
          ...i,
          grossProfitCents: i.revenueCents - i.costCents,
          marginPct: i.revenueCents > 0 ? ((i.revenueCents - i.costCents) / i.revenueCents) * 100 : 0,
        }))
        .sort((a, b) => b.grossProfitCents - a.grossProfitCents),
    })).sort((a, b) => b.grossProfitCents - a.grossProfitCents);

    const totalRevenueCents = categories.reduce((s, c) => s + c.revenueCents, 0);
    const totalCostCents = categories.reduce((s, c) => s + c.costCents, 0);
    return {
      categories,
      totalRevenueCents,
      totalCostCents,
      totalGrossProfitCents: totalRevenueCents - totalCostCents,
      overallMarginPct: totalRevenueCents > 0 ? ((totalRevenueCents - totalCostCents) / totalRevenueCents) * 100 : 0,
    };
  }

  // ─── NSSF Return File (CSV) ───────────────────────────────────────────────────

  async nssfReturnFile(businessId: string, month: number, year: number): Promise<string> {
    const run = await (this.prisma as any).payrollRun.findFirst({
      where: { businessId, month, year, status: { in: ['APPROVED', 'PAID'] } },
      include: {
        payslips: {
          include: { payrollRun: true },
        },
      },
    });

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthName = MONTHS[(month - 1) % 12];

    const lines: string[] = [];
    lines.push('Member Name,Employee Number,Gross Salary (KES),NSSF Employee (KES),NSSF Employer (KES),Total NSSF (KES)');

    if (run && run.payslips) {
      for (const slip of run.payslips as any[]) {
        const gross = (slip.grossPay ?? 0) / 100; // convert cents to KES
        const nssfEmployee = ((slip.nssf1Amount ?? 0) + (slip.nssf2Amount ?? 0)) / 100;
        const nssfEmployer = nssfEmployee; // Employer matches employee
        const totalNssf = nssfEmployee + nssfEmployer;
        const empNum = slip.employeeId ?? '';
        const name = (slip.employeeName ?? '').replace(/,/g, ' ');
        lines.push(`"${name}","${empNum}",${gross.toFixed(2)},${nssfEmployee.toFixed(2)},${nssfEmployer.toFixed(2)},${totalNssf.toFixed(2)}`);
      }
    }

    lines.push('');
    lines.push(`# NSSF Return — ${monthName} ${year}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    if (!run) lines.push('# WARNING: No APPROVED/PAID payroll run found for this period');

    return lines.join('\n');
  }

  // ─── SHIF Return File (CSV) ───────────────────────────────────────────────────

  async shifReturnFile(businessId: string, month: number, year: number): Promise<string> {
    const run = await (this.prisma as any).payrollRun.findFirst({
      where: { businessId, month, year, status: { in: ['APPROVED', 'PAID'] } },
      include: {
        payslips: {
          include: { payrollRun: true },
        },
      },
    });

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthName = MONTHS[(month - 1) % 12];

    const lines: string[] = [];
    lines.push('Employee Name,Employee Number,Gross Salary (KES),SHIF Deduction (KES)');

    if (run && run.payslips) {
      for (const slip of run.payslips as any[]) {
        const gross = (slip.grossPay ?? 0) / 100;
        const shif = (slip.shifAmount ?? 0) / 100;
        const empNum = slip.employeeId ?? '';
        const name = (slip.employeeName ?? '').replace(/,/g, ' ');
        lines.push(`"${name}","${empNum}",${gross.toFixed(2)},${shif.toFixed(2)}`);
      }
    }

    lines.push('');
    lines.push(`# SHIF Return — ${monthName} ${year}`);
    lines.push(`# Generated: ${new Date().toISOString()}`);
    if (!run) lines.push('# WARNING: No APPROVED/PAID payroll run found for this period');

    return lines.join('\n');
  }

  // ─── Shrinkage Report ────────────────────────────────────────────────────────

  async shrinkageReport(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      businessId,
      type: 'ADJUSTMENT',
      quantity: { lt: 0 },
    };
    if (storeId) where.storeId = storeId;
    if (startDate) where.createdAt = { gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const movements = await this.prisma.inventoryMovement.findMany({
      where,
      include: { item: { select: { name: true, barcode: true, costPriceCents: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const byItem = new Map<string, { itemId: string; name: string; sku: string; totalUnitsLost: number; totalValueCents: number; incidents: number }>();
    for (const m of movements) {
      const key = m.itemId;
      const existing = byItem.get(key) ?? { itemId: m.itemId, name: m.item.name, sku: m.item.barcode ?? '', totalUnitsLost: 0, totalValueCents: 0, incidents: 0 };
      existing.totalUnitsLost += Math.abs(m.quantity);
      existing.totalValueCents += Math.abs(m.quantity) * (m.item.costPriceCents ?? 0);
      existing.incidents += 1;
      byItem.set(key, existing);
    }

    const items = Array.from(byItem.values()).sort((a, b) => b.totalValueCents - a.totalValueCents);
    const totalValueCents = items.reduce((s, i) => s + i.totalValueCents, 0);

    return { items, totalValueCents, totalIncidents: movements.length };
  }

  // ─── Department / Category P&L ───────────────────────────────────────────────

  async departmentPnl(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {
      sale: { businessId, status: { in: ['PAID', 'AMENDED'] } },
    };
    if (storeId) where.sale = { ...where.sale, storeId };
    if (startDate || endDate) {
      where.sale = { ...where.sale, createdAt: {} };
      if (startDate) where.sale.createdAt.gte = startDate;
      if (endDate) where.sale.createdAt.lte = endDate;
    }

    const saleItems = await this.prisma.saleItem.findMany({
      where,
      include: {
        item: { select: { category: true, costPriceCents: true } },
        sale: { select: { storeId: true } },
      },
    });

    const byCategory = new Map<string, { category: string; revenueCents: number; cogsCents: number; units: number }>();
    for (const si of saleItems) {
      const cat = (si.item as any)?.category ?? 'Uncategorized';
      const key = storeId ? cat : `${si.sale.storeId}::${cat}`;
      const existing = byCategory.get(key) ?? { category: cat, revenueCents: 0, cogsCents: 0, units: 0 };
      existing.revenueCents += si.totalCents;
      existing.cogsCents += ((si.item as any)?.costPriceCents ?? 0) * si.quantity;
      existing.units += si.quantity;
      byCategory.set(key, existing);
    }

    const departments = Array.from(byCategory.values()).map(d => ({
      ...d,
      grossProfitCents: d.revenueCents - d.cogsCents,
      marginPct: d.revenueCents > 0 ? ((d.revenueCents - d.cogsCents) / d.revenueCents) * 100 : 0,
    })).sort((a, b) => b.revenueCents - a.revenueCents);

    const totals = departments.reduce((acc, d) => ({
      revenueCents: acc.revenueCents + d.revenueCents,
      cogsCents: acc.cogsCents + d.cogsCents,
      grossProfitCents: acc.grossProfitCents + d.grossProfitCents,
    }), { revenueCents: 0, cogsCents: 0, grossProfitCents: 0 });

    return {
      departments,
      totals: { ...totals, marginPct: totals.revenueCents > 0 ? (totals.grossProfitCents / totals.revenueCents) * 100 : 0 },
    };
  }

  // ─── Recipe Costing Report ────────────────────────────────────────────────

  async recipeCostingReport(businessId: string) {
    const items = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null },
      include: {
        bundleComponents: {
          include: {
            componentItem: { select: { name: true, costPriceCents: true } },
          },
        },
      },
    });

    const recipeItems = items.filter(i => i.bundleComponents.length > 0);

    const mapped = recipeItems.map(item => {
      const bc = item.bundleComponents;
      const totalIngredientCostCents = bc.reduce((s, c) => s + c.quantity * (c.componentItem.costPriceCents ?? 0), 0);
      const sellingPriceCents = item.retailPriceCents ?? 0;
      const foodCostPct = sellingPriceCents > 0 ? (totalIngredientCostCents / sellingPriceCents) * 100 : null;
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        sellingPriceCents,
        totalIngredientCostCents,
        foodCostPct,
        grossMarginPct: sellingPriceCents > 0 ? ((sellingPriceCents - totalIngredientCostCents) / sellingPriceCents) * 100 : null,
        status: foodCostPct === null ? 'NO_PRICE' : foodCostPct > 35 ? 'HIGH_COST' : foodCostPct > 25 ? 'ACCEPTABLE' : 'LOW_COST',
        components: bc.map(c => ({
          name: c.componentItem.name,
          quantity: c.quantity,
          costPriceCents: c.componentItem.costPriceCents ?? 0,
          totalCostCents: c.quantity * (c.componentItem.costPriceCents ?? 0),
        })),
      };
    }).sort((a, b) => (b.foodCostPct ?? 0) - (a.foodCostPct ?? 0));

    const withCost = mapped.filter(r => r.foodCostPct !== null);
    const avgFoodCostPct = withCost.length > 0
      ? withCost.reduce((s, r) => s + (r.foodCostPct ?? 0), 0) / withCost.length
      : 0;

    return {
      items: mapped,
      summary: {
        totalItems: mapped.length,
        avgFoodCostPct,
        highCostItems: mapped.filter(r => r.status === 'HIGH_COST').length,
      },
    };
  }

  // ─── Customer Analytics ────────────────────────────────────────────────────

  async customerAnalytics(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        items: { select: { quantity: true, totalCents: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Customer segmentation (RFM analysis)
    const customerMap = new Map<string, {
      customerId: string;
      name: string;
      phone?: string;
      email?: string;
      totalSpentCents: number;
      transactionCount: number;
      avgOrderValueCents: number;
      lastPurchaseDate: Date;
      daysSinceLastPurchase: number;
      totalItemsPurchased: number;
    }>();

    const now = new Date();
    for (const sale of sales) {
      const customerId = sale.customerId || 'walk-in';
      const customerName = sale.customer?.name || sale.customerName || 'Walk-in Customer';
      
      const existing = customerMap.get(customerId) || {
        customerId,
        name: customerName,
        phone: sale.customer?.phone || sale.customerPhone,
        email: sale.customer?.email,
        totalSpentCents: 0,
        transactionCount: 0,
        avgOrderValueCents: 0,
        lastPurchaseDate: sale.createdAt,
        daysSinceLastPurchase: 0,
        totalItemsPurchased: 0,
      };

      existing.totalSpentCents += sale.totalCents;
      existing.transactionCount += 1;
      existing.totalItemsPurchased += sale.items.reduce((sum, item) => sum + item.quantity, 0);
      
      if (sale.createdAt > existing.lastPurchaseDate) {
        existing.lastPurchaseDate = sale.createdAt;
      }
      
      customerMap.set(customerId, existing);
    }

    // Calculate final metrics
    const customers = Array.from(customerMap.values()).map(customer => {
      customer.avgOrderValueCents = customer.transactionCount > 0 
        ? Math.round(customer.totalSpentCents / customer.transactionCount) 
        : 0;
      customer.daysSinceLastPurchase = Math.floor(
        (now.getTime() - customer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return customer;
    });

    // Sort customers by total spent
    const topCustomers = customers
      .filter(c => c.customerId !== 'walk-in')
      .sort((a, b) => b.totalSpentCents - a.totalSpentCents)
      .slice(0, 20);

    // RFM Segmentation
    const validCustomers = customers.filter(c => c.customerId !== 'walk-in');
    const segments = {
      champions: validCustomers.filter(c => c.totalSpentCents > 50000 && c.daysSinceLastPurchase <= 30).length,
      loyalCustomers: validCustomers.filter(c => c.transactionCount >= 5 && c.daysSinceLastPurchase <= 60).length,
      potentialLoyalists: validCustomers.filter(c => c.transactionCount >= 3 && c.daysSinceLastPurchase <= 90).length,
      atRisk: validCustomers.filter(c => c.totalSpentCents > 20000 && c.daysSinceLastPurchase > 90).length,
      cannotLoseThem: validCustomers.filter(c => c.totalSpentCents > 100000 && c.daysSinceLastPurchase > 60).length,
      hibernating: validCustomers.filter(c => c.daysSinceLastPurchase > 180).length,
    };

    // Customer lifecycle analysis
    const newCustomers = validCustomers.filter(c => c.daysSinceLastPurchase <= 30 && c.transactionCount === 1).length;
    const returningCustomers = validCustomers.filter(c => c.transactionCount > 1).length;
    const totalCustomers = validCustomers.length;
    const walkInSales = customers.find(c => c.customerId === 'walk-in');

    // Calculate average order value and customer lifetime value
    const totalRevenueCents = validCustomers.reduce((sum, c) => sum + c.totalSpentCents, 0);
    const totalTransactions = validCustomers.reduce((sum, c) => sum + c.transactionCount, 0);
    const avgOrderValue = totalTransactions > 0 ? Math.round(totalRevenueCents / totalTransactions) : 0;
    const customerLifetimeValue = totalCustomers > 0 ? Math.round(totalRevenueCents / totalCustomers) : 0;

    // Format top customers for frontend
    const formattedTopCustomers = topCustomers.map(customer => ({
      id: customer.customerId,
      name: customer.name,
      totalSpent: customer.totalSpentCents,
      orderCount: customer.transactionCount,
      lastVisit: customer.lastPurchaseDate.toISOString(),
    }));

    // Format RFM segments for frontend
    const rfmSegments = [
      { segment: 'Champions', count: segments.champions, avgSpend: segments.champions > 0 ? Math.round(validCustomers.filter(c => c.totalSpentCents > 50000 && c.daysSinceLastPurchase <= 30).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.champions) : 0 },
      { segment: 'Loyal Customers', count: segments.loyalCustomers, avgSpend: segments.loyalCustomers > 0 ? Math.round(validCustomers.filter(c => c.transactionCount >= 5 && c.daysSinceLastPurchase <= 60).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.loyalCustomers) : 0 },
      { segment: 'Potential Loyalists', count: segments.potentialLoyalists, avgSpend: segments.potentialLoyalists > 0 ? Math.round(validCustomers.filter(c => c.transactionCount >= 3 && c.daysSinceLastPurchase <= 90).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.potentialLoyalists) : 0 },
      { segment: 'At Risk', count: segments.atRisk, avgSpend: segments.atRisk > 0 ? Math.round(validCustomers.filter(c => c.totalSpentCents > 20000 && c.daysSinceLastPurchase > 90).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.atRisk) : 0 },
      { segment: 'Cannot Lose Them', count: segments.cannotLoseThem, avgSpend: segments.cannotLoseThem > 0 ? Math.round(validCustomers.filter(c => c.totalSpentCents > 100000 && c.daysSinceLastPurchase > 60).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.cannotLoseThem) : 0 },
      { segment: 'Hibernating', count: segments.hibernating, avgSpend: segments.hibernating > 0 ? Math.round(validCustomers.filter(c => c.daysSinceLastPurchase > 180).reduce((sum, c) => sum + c.totalSpentCents, 0) / segments.hibernating) : 0 },
    ].filter(segment => segment.count > 0);

    return {
      totalCustomers,
      newCustomers,
      returningCustomers,
      avgOrderValue,
      customerLifetimeValue,
      topCustomers: formattedTopCustomers,
      rfmSegments,
      summary: {
        totalCustomers,
        newCustomers,
        returningCustomers,
        walkInTransactions: walkInSales?.transactionCount || 0,
        walkInRevenueCents: walkInSales?.totalSpentCents || 0,
        avgCustomerValueCents: customerLifetimeValue,
        avgTransactionsPerCustomer: totalCustomers > 0
          ? Math.round((totalTransactions / totalCustomers) * 100) / 100
          : 0,
      },
      segments,
      customerLifecycle: {
        new: newCustomers,
        returning: returningCustomers,
        dormant: segments.hibernating,
        atRisk: segments.atRisk,
      },
    };
  }

  // ─── Advanced Forecast ─────────────────────────────────────────────────────

  async advancedForecast(businessId: string, storeId?: string, days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days * 3)); // Look back 3x the forecast period

    const where: any = { businessId, status: { in: ['PAID', 'AMENDED'] } };
    if (storeId) where.storeId = storeId;
    where.createdAt = { gte: startDate, lte: endDate };

    const saleItems = await this.prisma.saleItem.findMany({
      where: { sale: where },
      include: {
        item: { select: { id: true, name: true, category: true, trackStock: true } },
        sale: { select: { createdAt: true } },
      },
      orderBy: { sale: { createdAt: 'asc' } },
    });

    // Group by item and calculate daily sales
    const itemSalesMap = new Map<string, {
      itemId: string;
      name: string;
      category: string;
      dailySales: number[];
      totalSold: number;
      avgDailySales: number;
      trend: 'increasing' | 'decreasing' | 'stable';
      seasonality: number;
      forecastDemand: number;
      confidence: number;
    }>();

    // Initialize daily sales arrays
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    for (const saleItem of saleItems) {
      if (!saleItem.item?.trackStock) continue;
      
      const itemId = saleItem.itemId;
      if (!itemSalesMap.has(itemId)) {
        itemSalesMap.set(itemId, {
          itemId,
          name: saleItem.item.name,
          category: saleItem.item.category || 'Uncategorized',
          dailySales: new Array(totalDays).fill(0),
          totalSold: 0,
          avgDailySales: 0,
          trend: 'stable',
          seasonality: 1,
          forecastDemand: 0,
          confidence: 0,
        });
      }

      const item = itemSalesMap.get(itemId)!;
      const dayIndex = Math.floor((saleItem.sale.createdAt.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (dayIndex >= 0 && dayIndex < totalDays) {
        item.dailySales[dayIndex] += saleItem.quantity;
        item.totalSold += saleItem.quantity;
      }
    }

    // Calculate forecasts using linear regression
    const forecasts = Array.from(itemSalesMap.values()).map(item => {
      const sales = item.dailySales;
      const n = sales.length;
      
      if (n === 0 || item.totalSold === 0) {
        return { ...item, forecastDemand: 0, confidence: 0, trend: 'stable' as const };
      }

      // Calculate average daily sales
      item.avgDailySales = item.totalSold / n;

      // Simple linear regression for trend
      const xSum = (n * (n - 1)) / 2;
      const ySum = sales.reduce((sum, val) => sum + val, 0);
      const xySum = sales.reduce((sum, val, idx) => sum + (val * idx), 0);
      const x2Sum = (n * (n - 1) * (2 * n - 1)) / 6;

      const slope = n > 1 ? (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum) : 0;
      const intercept = (ySum - slope * xSum) / n;

      // Determine trend
      const trend = Math.abs(slope) < 0.01 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';

      // Calculate forecast for the next period
      const forecastDemand = Math.max(0, Math.round((intercept + slope * n) * days));

      // Calculate confidence based on variance
      const variance = sales.reduce((sum, val) => {
        const predicted = intercept + slope * sales.indexOf(val);
        return sum + Math.pow(val - predicted, 2);
      }, 0) / n;
      
      const confidence = Math.max(0, Math.min(100, 100 - (Math.sqrt(variance) / item.avgDailySales) * 100));

      return {
        ...item,
        trend,
        forecastDemand,
        confidence: Math.round(confidence),
      };
    });

    // Sort by forecast demand (highest first)
    const sortedForecasts = forecasts
      .filter(f => f.forecastDemand > 0)
      .sort((a, b) => b.forecastDemand - a.forecastDemand);

    // Get current stock levels
    const itemIds = sortedForecasts.map(f => f.itemId);
    const stockLevels = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId'],
      where: {
        businessId,
        ...(storeId && { storeId }),
        itemId: { in: itemIds },
      },
      _sum: { quantity: true },
    });

    const stockMap = new Map(stockLevels.map(s => [s.itemId, s._sum.quantity || 0]));

    // Add reorder recommendations
    const recommendations = sortedForecasts.map(forecast => {
      const currentStock = stockMap.get(forecast.itemId) || 0;
      const needsReorder = currentStock < forecast.forecastDemand;
      const suggestedOrderQty = needsReorder 
        ? Math.max(0, forecast.forecastDemand - currentStock + Math.round(forecast.avgDailySales * 7)) // Add 1 week buffer
        : 0;

      return {
        ...forecast,
        currentStock,
        needsReorder,
        suggestedOrderQty,
        stockoutRisk: currentStock === 0 ? 'high' : currentStock < forecast.forecastDemand * 0.5 ? 'medium' : 'low',
      };
    });

    // Map to the shape the frontend expects
    const items = recommendations.slice(0, 50).map(r => ({
      itemId: r.itemId,
      itemName: r.name,
      currentStock: r.currentStock,
      forecastedDemand: r.forecastDemand,
      confidence: (r.confidence >= 70 ? 'HIGH' : r.confidence >= 40 ? 'MEDIUM' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
      trend: r.trend === 'increasing' ? 0.15 : r.trend === 'decreasing' ? -0.15 : 0,
      seasonality: r.seasonality ?? 1,
      reorderPoint: Math.round(r.avgDailySales * 14), // 2-week reorder point
      suggestedOrderQty: r.suggestedOrderQty,
    }));

    return { items, demandPatterns: [] };
  }

  // ── VAT Return (iTax-ready) ────────────────────────────────────────────────────

  async getVATReturn(businessId: string, month: string) {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 0, 23, 59, 59);

    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: { in: ['PAID', 'AMENDED'] },
        createdAt: { gte: start, lte: end },
      },
      select: {
        totalCents: true,
        vatCents: true,
        totCents: true,
        subtotalCents: true,
        discountCents: true,
        receiptNumber: true,
        createdAt: true,
      },
    });

    // Only sales that actually carried VAT belong on a VAT return. The filter
    // used to be `vatCents > 0 || totCents === 0`, whose second clause swept in
    // every sale from a business with tax turned off (both fields 0) and then
    // recomputed 16/116 on it — overstating output VAT on a statutory return.
    const vatSales = sales.filter(s => s.vatCents > 0);
    const totalOutputVAT = vatSales.reduce((s, sale) => s + recalcVat(sale.vatCents, sale.subtotalCents, sale.discountCents), 0);
    const vatableValue = vatSales.reduce((s, sale) => {
      const vat = recalcVat(sale.vatCents, sale.subtotalCents, sale.discountCents);
      return s + (sale.totalCents - vat);
    }, 0);

    const totSales = sales.filter(s => s.totCents > 0);
    const totalTOT = totSales.reduce((s, sale) => s + recalcTot(sale.totCents, sale.subtotalCents, sale.discountCents), 0);
    const zeroRatedSales = totSales.reduce((s, sale) => s + sale.totalCents, 0);

    // Input VAT from approved VAT-reclaimable expenses
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        createdAt: { gte: start, lte: end },
        approvalStatus: 'APPROVED',
        vatReclaimable: true,
      },
    });
    const inputVAT = Math.round(expenses.reduce((s, e) => s + e.amountCents, 0) * 16 / 116);

    const netVATPayable = Math.max(0, totalOutputVAT - inputVAT);

    return {
      period: month,
      vatableValue,
      outputVAT: totalOutputVAT,
      zeroRatedSales,
      totalTOT,
      inputVAT,
      netVATPayable,
      saleCount: sales.length,
      // iTax box labels
      box1_output_vat: totalOutputVAT,
      box2_input_vat: inputVAT,
      box3_net_payable: netVATPayable,
      expenses: expenses.length,
    };
  }

  async menuEngineering(businessId: string, storeId: string | undefined, days: number) {
    const since = new Date(Date.now() - days * 86400000);
    const sales = await this.prisma.saleItem.findMany({
      where: { sale: { businessId, createdAt: { gte: since }, ...(storeId && { storeId }) } },
      include: { item: { select: { name: true, costPriceCents: true, category: true } } },
    });
    const map = new Map<string, { name: string; category: string; qty: number; revenueCents: number; costCents: number }>();
    for (const si of sales) {
      const entry = map.get(si.itemId) ?? { name: si.item?.name ?? si.itemId, category: si.item?.category ?? '', qty: 0, revenueCents: 0, costCents: 0 };
      entry.qty += si.quantity;
      entry.revenueCents += si.totalCents;
      entry.costCents += (si.item?.costPriceCents ?? 0) * si.quantity;
      map.set(si.itemId, entry);
    }
    const items = [...map.entries()].map(([id, d]) => ({
      id,
      name: d.name,
      category: d.category,
      qty: d.qty,
      revenueCents: d.revenueCents,
      marginCents: d.revenueCents - d.costCents,
      marginPct: d.revenueCents > 0 ? Math.round(((d.revenueCents - d.costCents) / d.revenueCents) * 100) : 0,
    }));
    if (!items.length) return { items: [] };
    const avgQty = items.reduce((s, i) => s + i.qty, 0) / items.length;
    const avgMarginPct = items.reduce((s, i) => s + i.marginPct, 0) / items.length;
    return {
      items: items.map(i => ({
        ...i,
        quadrant: i.qty >= avgQty && i.marginPct >= avgMarginPct ? 'STAR'
          : i.qty >= avgQty && i.marginPct < avgMarginPct ? 'PLOWHORSE'
          : i.qty < avgQty && i.marginPct >= avgMarginPct ? 'PUZZLE'
          : 'DOG',
      })),
      avgQty,
      avgMarginPct: Math.round(avgMarginPct),
    };
  }

  async basketAnalysis(businessId: string, days: number) {
    const since = new Date(Date.now() - days * 86400000);
    const sales = await this.prisma.sale.findMany({
      where: { businessId, createdAt: { gte: since } },
      include: { items: { select: { itemId: true, name: true } } },
    });
    const pairs = new Map<string, { item1: string; item2: string; count: number; name1: string; name2: string }>();
    for (const sale of sales) {
      const saleItems = sale.items;
      for (let i = 0; i < saleItems.length; i++) {
        for (let j = i + 1; j < saleItems.length; j++) {
          const [a, b] = [saleItems[i], saleItems[j]].sort((x, y) => x.itemId.localeCompare(y.itemId));
          const key = `${a.itemId}|${b.itemId}`;
          const existing = pairs.get(key) ?? { item1: a.itemId, item2: b.itemId, count: 0, name1: a.name, name2: b.name };
          existing.count++;
          pairs.set(key, existing);
        }
      }
    }
    const result = [...pairs.values()].sort((a, b) => b.count - a.count).slice(0, 50);
    return { pairs: result, totalSales: sales.length };
  }

  async customerLifetimeValue(businessId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { businessId },
      include: {
        sales: {
          select: { totalCents: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return customers
      .filter(c => c.sales.length > 0)
      .map(c => {
        const totalSpend = c.sales.reduce((s, sale) => s + sale.totalCents, 0);
        const firstVisit = c.sales[0].createdAt;
        const lastVisit = c.sales[c.sales.length - 1].createdAt;
        const daysSinceFirst = Math.max(1, (Date.now() - firstVisit.getTime()) / 86400000);
        const visitFrequencyDays = c.sales.length > 1 ? daysSinceFirst / (c.sales.length - 1) : null;
        const daysSinceLast = (Date.now() - lastVisit.getTime()) / 86400000;
        const churnRisk = daysSinceLast > 90 ? 'HIGH' : daysSinceLast > 30 ? 'MEDIUM' : 'LOW';
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          visitCount: c.sales.length,
          totalSpendCents: totalSpend,
          avgOrderCents: Math.round(totalSpend / c.sales.length),
          firstVisit,
          lastVisit,
          daysSinceLast: Math.round(daysSinceLast),
          visitFrequencyDays: visitFrequencyDays ? Math.round(visitFrequencyDays) : null,
          churnRisk,
        };
      })
      .sort((a, b) => b.totalSpendCents - a.totalSpendCents);
  }

  async npsSummary(businessId: string, startDate?: string, endDate?: string) {
    const responses = await this.prisma.npsResponse.findMany({
      where: {
        businessId,
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      },
      orderBy: { createdAt: 'desc' },
    });
    const total = responses.length;
    const avg = total ? responses.reduce((s, r) => s + r.score, 0) / total : null;
    const promoters = responses.filter(r => r.score >= 9).length;
    const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length;
    const detractors = responses.filter(r => r.score <= 6).length;
    const npsScore = total ? Math.round(((promoters - detractors) / total) * 100) : null;
    const byDay = new Map<string, number[]>();
    for (const r of responses) {
      const day = r.createdAt.toISOString().slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(r.score);
    }
    const trend = [...byDay.entries()].map(([date, scores]) => ({
      date,
      avg: scores.reduce((s, v) => s + v, 0) / scores.length,
      count: scores.length,
    })).sort((a, b) => a.date.localeCompare(b.date));
    return { total, avg, npsScore, promoters, passives, detractors, trend, recent: responses.slice(0, 20) };
  }

  // ─── Field Invoice Ageing ─────────────────────────────────────────────────

  async fieldInvoiceAgeing(businessId: string) {
    const orders = await (this.prisma as any).fieldOrder.findMany({
      where: {
        businessId,
        status: 'INVOICED',
        paymentStatus: { not: 'PAID' },
      },
      include: {
        customer: { select: { name: true, phone: true } },
        agent: { select: { name: true } },
      },
      orderBy: { invoicedAt: 'asc' },
    });

    const now = Date.now();
    const rows = orders.map((o: any) => {
      const invoicedMs = o.invoicedAt ? new Date(o.invoicedAt).getTime() : new Date(o.createdAt).getTime();
      const daysOut = Math.floor((now - invoicedMs) / 86400000);
      const outstanding = o.totalCents - o.paidAmountCents;
      const bucket =
        daysOut <= 30 ? '0-30d' :
        daysOut <= 60 ? '31-60d' :
        daysOut <= 90 ? '61-90d' : '90+d';
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        invoiceNumber: o.invoiceNumber,
        invoicedAt: o.invoicedAt,
        customerName: o.customer?.name,
        customerPhone: o.customer?.phone,
        agentName: o.agent?.name,
        totalCents: o.totalCents,
        paidAmountCents: o.paidAmountCents,
        outstandingCents: outstanding,
        daysOutstanding: daysOut,
        paymentStatus: o.paymentStatus,
        bucket,
      };
    });

    const summary = {
      '0-30d': rows.filter((r: any) => r.bucket === '0-30d').reduce((s: number, r: any) => s + r.outstandingCents, 0),
      '31-60d': rows.filter((r: any) => r.bucket === '31-60d').reduce((s: number, r: any) => s + r.outstandingCents, 0),
      '61-90d': rows.filter((r: any) => r.bucket === '61-90d').reduce((s: number, r: any) => s + r.outstandingCents, 0),
      '90+d': rows.filter((r: any) => r.bucket === '90+d').reduce((s: number, r: any) => s + r.outstandingCents, 0),
      totalOutstanding: rows.reduce((s: number, r: any) => s + r.outstandingCents, 0),
    };

    return { rows, summary };
  }
}
