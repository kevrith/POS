import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ExpenseService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(data: {
    offlineId: string;
    businessId: string;
    storeId: string;
    amountCents: number;
    category: string;
    description: string;
    paidBy: string;
    submittedBy: string;
    receiptPhotoUrl?: string;
    isRecurring?: boolean;
    recurringDay?: number;
    cashDrawerSessionId?: string;
    vatReclaimable?: boolean;
    vatAmountCents?: number;
  }) {
    const business = await this.prisma.business.findUnique({
      where: { id: data.businessId },
    });

    const needsApproval = data.amountCents > (business.expenseApprovalThresholdCents || 500000);

    return this.prisma.expense.create({
      data: {
        ...data,
        approvalStatus: needsApproval ? 'PENDING' : 'APPROVED',
      },
    });
  }

  async findAll(businessId: string, filters?: {
    category?: string;
    startDate?: Date;
    endDate?: Date;
    approvalStatus?: string;
  }) {
    return this.prisma.expense.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(filters?.category && { category: filters.category }),
        ...(filters?.approvalStatus && { approvalStatus: filters.approvalStatus }),
        ...(filters?.startDate && filters?.endDate && {
          createdAt: {
            gte: filters.startDate,
            lte: filters.endDate,
          },
        }),
      },
      include: {
        approvalSteps: { orderBy: { level: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, approvedBy: string) {
    const expense = await this.prisma.expense.update({
      where: { id },
      data: { approvalStatus: 'APPROVED', approvedBy },
    });

    // Check budget thresholds after approval
    this.checkBudgetThreshold(expense.businessId, expense.category, expense.createdAt).catch(() => {});

    return expense;
  }

  private async checkBudgetThreshold(businessId: string, category: string, referenceDate: Date) {
    const month = referenceDate.getMonth() + 1;
    const year = referenceDate.getFullYear();

    const budget = await this.prisma.budget.findFirst({
      where: { businessId, category, month, year },
    });
    if (!budget || budget.amountCents <= 0) return;

    const agg = await this.prisma.expense.aggregate({
      where: {
        businessId,
        category,
        approvalStatus: 'APPROVED',
        deletedAt: null,
        createdAt: {
          gte: new Date(year, month - 1, 1),
          lte: new Date(year, month, 0, 23, 59, 59),
        },
      },
      _sum: { amountCents: true },
    });

    const totalCents = agg._sum.amountCents ?? 0;
    const pctUsed = (totalCents / budget.amountCents) * 100;
    const fmt = (c: number) => `KES ${(c / 100).toFixed(2)}`;

    if (pctUsed >= 100) {
      await this.notifications.createNotification({
        businessId,
        type: 'BUDGET_EXCEEDED',
        priority: 'HIGH',
        title: `Budget Exceeded: ${category}`,
        body: `The ${category} budget of ${fmt(budget.amountCents)} has been exceeded. Spent: ${fmt(totalCents)} (${Math.round(pctUsed)}%).`,
        entityType: 'Budget',
      });
    } else if (pctUsed >= 80) {
      await this.notifications.createNotification({
        businessId,
        type: 'BUDGET_WARNING',
        priority: 'NORMAL',
        title: `Budget Warning: ${category}`,
        body: `The ${category} budget is ${Math.round(pctUsed)}% used. Spent ${fmt(totalCents)} of ${fmt(budget.amountCents)}.`,
        entityType: 'Budget',
      });
    }
  }

  async reject(id: string, approvedBy: string) {
    return this.prisma.expense.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        approvedBy,
      },
    });
  }

  async getTotalByCategory(businessId: string, startDate: Date, endDate: Date) {
    const expenses = await this.prisma.expense.groupBy({
      by: ['category'],
      where: {
        businessId,
        approvalStatus: 'APPROVED',
        deletedAt: null,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        amountCents: true,
      },
    });

    return expenses.map(e => ({
      category: e.category,
      totalCents: e._sum.amountCents || 0,
    }));
  }

  // ── Recurring Expenses ────────────────────────────────────────────────────────

  async getRecurringExpenses(businessId: string) {
    return this.prisma.expense.findMany({
      where: { businessId, isRecurring: true, deletedAt: null },
      orderBy: { recurringDay: 'asc' },
    });
  }

  async checkRecurringDue(businessId: string) {
    const today = new Date().getDate(); // day of month (1-31)
    const expenses = await this.prisma.expense.findMany({
      where: { businessId, isRecurring: true, recurringDay: today, deletedAt: null },
    });

    for (const expense of expenses) {
      // Check if already created this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const existing = await this.prisma.expense.findFirst({
        where: {
          businessId,
          category: expense.category,
          description: expense.description,
          isRecurring: false,
          createdAt: { gte: startOfMonth },
        },
      });

      if (!existing) {
        // Create notification that this recurring expense is due
        await this.notifications.createNotification({
          businessId,
          type: 'EXPENSE_DUE',
          priority: 'MEDIUM',
          title: 'Recurring Expense Due',
          body: `Recurring expense "${expense.description ?? expense.category}" (KES ${(expense.amountCents / 100).toFixed(2)}) is due today.`,
          entityType: 'Expense',
          entityId: expense.id,
        });
      }
    }
  }

  /** Runs every day at 8am to notify businesses of recurring expenses due today. */
  @Cron('0 8 * * *')
  async runRecurringCheck() {
    const businesses = await this.prisma.business.findMany({ select: { id: true } });
    for (const biz of businesses) {
      await this.checkRecurringDue(biz.id).catch(() => {});
    }
  }

  // ── Multi-level Approval Chain ────────────────────────────────────────────────

  async requestApproval(expenseId: string, approverId: string, level: number = 1) {
    return this.prisma.expenseApprovalStep.create({
      data: { expenseId, approverId, level, status: 'PENDING' },
    });
  }

  async approveStep(stepId: string, comment?: string) {
    const step = await this.prisma.expenseApprovalStep.update({
      where: { id: stepId },
      data: { status: 'APPROVED', comment, actionAt: new Date() },
    });
    const allSteps = await this.prisma.expenseApprovalStep.findMany({
      where: { expenseId: step.expenseId },
    });
    if (allSteps.every((s) => s.status === 'APPROVED')) {
      await this.prisma.expense.update({
        where: { id: step.expenseId },
        data: { approvalStatus: 'APPROVED' },
      });
    }
    return step;
  }

  async rejectStep(stepId: string, comment: string) {
    const step = await this.prisma.expenseApprovalStep.update({
      where: { id: stepId },
      data: { status: 'REJECTED', comment, actionAt: new Date() },
    });
    await this.prisma.expense.update({
      where: { id: step.expenseId },
      data: { approvalStatus: 'REJECTED' },
    });
    return step;
  }

  async getExpenseWithApprovalChain(expenseId: string) {
    return this.prisma.expense.findUnique({
      where: { id: expenseId },
      include: { approvalSteps: { orderBy: { level: 'asc' } } },
    });
  }

  // ── VAT Reclaim Summary ────────────────────────────────────────────────────────

  async getVATReclaimSummary(businessId: string, startDate: string, endDate: string) {
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        vatReclaimable: true,
        approvalStatus: 'APPROVED',
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
    });
    const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0);
    const vatCents = Math.round(totalCents * 16 / 116);
    return { count: expenses.length, totalCents, vatCents, expenses };
  }

  // ── Petty Cash Float ──────────────────────────────────────────────────────────

  async getPettyCashFloat(businessId: string, storeId?: string) {
    const whereStoreId = storeId ?? null;
    const float = await this.prisma.pettyCashFloat.findFirst({
      where: { businessId, storeId: whereStoreId },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 30 } },
    });
    return float ?? {
      id: null,
      businessId,
      storeId: whereStoreId,
      balanceCents: 0,
      lastTopUpAt: null,
      transactions: [],
    };
  }

  async topUpPettyCash(
    businessId: string,
    storeId: string | undefined,
    amountCents: number,
    description: string,
    userId: string,
  ) {
    const whereStoreId = storeId ?? null;
    let float = await this.prisma.pettyCashFloat.findFirst({
      where: { businessId, storeId: whereStoreId },
    });
    if (!float) {
      float = await this.prisma.pettyCashFloat.create({
        data: { businessId, storeId: whereStoreId, balanceCents: 0 },
      });
    }
    await this.prisma.pettyCashFloat.update({
      where: { id: float.id },
      data: { balanceCents: { increment: amountCents }, lastTopUpAt: new Date() },
    });
    await this.prisma.pettyCashTransaction.create({
      data: { floatId: float.id, type: 'TOP_UP', amountCents, description, userId },
    });
    return this.getPettyCashFloat(businessId, storeId);
  }

  async getVatReclaimable(businessId: string, startDate?: string, endDate?: string) {
    const where: any = { businessId, vatReclaimable: true, approvalStatus: 'APPROVED' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    const expenses = await this.prisma.expense.findMany({ where });
    const total = expenses.reduce((s, e) => s + (e.vatAmountCents ?? 0), 0);
    return { expenses, totalVatCents: total };
  }

  async disbursePettyCash(
    businessId: string,
    storeId: string | undefined,
    amountCents: number,
    description: string,
    reference: string | undefined,
    userId: string,
  ) {
    const whereStoreId = storeId ?? null;
    const float = await this.prisma.pettyCashFloat.findFirst({
      where: { businessId, storeId: whereStoreId },
    });
    if (!float) {
      throw new Error('No petty cash float found. Please top up first.');
    }
    if (float.balanceCents < amountCents) {
      throw new Error(
        `Insufficient balance. Available: KES ${(float.balanceCents / 100).toFixed(2)}`,
      );
    }
    await this.prisma.pettyCashFloat.update({
      where: { id: float.id },
      data: { balanceCents: { decrement: amountCents } },
    });
    await this.prisma.pettyCashTransaction.create({
      data: { floatId: float.id, type: 'DISBURSEMENT', amountCents, description, reference, userId },
    });
    return this.getPettyCashFloat(businessId, storeId);
  }
}
