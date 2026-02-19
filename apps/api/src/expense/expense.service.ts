import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpenseService {
  constructor(private prisma: PrismaService) {}

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
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, approvedBy: string) {
    return this.prisma.expense.update({
      where: { id },
      data: {
        approvalStatus: 'APPROVED',
        approvedBy,
      },
    });
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
}
