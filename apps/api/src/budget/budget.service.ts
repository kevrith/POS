import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  async getBudgets(businessId: string, year: number, month?: number) {
    return this.prisma.budget.findMany({
      where: {
        businessId,
        year,
        ...(month !== undefined ? { month } : {}),
      },
      orderBy: [{ month: 'asc' }, { category: 'asc' }],
    });
  }

  async upsertBudget(data: {
    businessId: string;
    category: string;
    amountCents: number;
    month: number;
    year: number;
  }) {
    return this.prisma.budget.upsert({
      where: {
        businessId_category_month_year: {
          businessId: data.businessId,
          category: data.category,
          month: data.month,
          year: data.year,
        },
      },
      create: data,
      update: { amountCents: data.amountCents },
    });
  }

  async deleteBudget(id: string, businessId: string) {
    return this.prisma.budget.deleteMany({ where: { id, businessId } });
  }

  async getBudgetVsActual(businessId: string, year: number, month: number) {
    const [budgets, expenses] = await Promise.all([
      this.prisma.budget.findMany({ where: { businessId, year, month } }),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: {
          businessId,
          approvalStatus: 'APPROVED',
          createdAt: {
            gte: new Date(year, month - 1, 1),
            lte: new Date(year, month, 0, 23, 59, 59),
          },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const actualByCategory: Record<string, number> = {};
    for (const exp of expenses) {
      actualByCategory[exp.category] = exp._sum.amountCents ?? 0;
    }

    return budgets.map((b) => ({
      ...b,
      actualCents: actualByCategory[b.category] ?? 0,
      varianceCents: b.amountCents - (actualByCategory[b.category] ?? 0),
      pctUsed:
        b.amountCents > 0
          ? Math.round(((actualByCategory[b.category] ?? 0) / b.amountCents) * 100)
          : 0,
    }));
  }
}
