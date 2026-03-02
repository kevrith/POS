import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async createProgram(data: {
    businessId: string;
    name: string;
    pointsPerCent: number;
    redemptionRate: number;
    minRedemption: number;
  }) {
    return this.prisma.loyaltyProgram.create({ data });
  }

  async getProgram(businessId: string) {
    return this.prisma.loyaltyProgram.findFirst({
      where: { businessId, isActive: true },
    });
  }

  async earnPoints(customerId: string, saleCents: number, saleId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    const program = await this.prisma.loyaltyProgram.findFirst({
      where: { businessId: customer.businessId, isActive: true },
    });

    if (!program) return { points: 0 };

    const points = Math.floor(saleCents * program.pointsPerCent);
    const newBalance = customer.loyaltyPoints + points;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    });

    await this.prisma.loyaltyTransaction.create({
      data: {
        customerId,
        saleId,
        type: 'EARN',
        points,
        balanceAfter: newBalance,
      },
    });

    return { points, balance: newBalance };
  }

  async redeemPoints(customerId: string, points: number, saleId: string) {
    // Use $transaction to prevent race conditions (double-spend of loyalty points)
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({
        where: { id: customerId },
      });
      if (!customer) throw new Error('Customer not found');

      const program = await tx.loyaltyProgram.findFirst({
        where: { businessId: customer.businessId, isActive: true },
      });

      if (!program) throw new Error('No active loyalty program');
      if (points < program.minRedemption) throw new Error('Below minimum redemption');
      if (customer.loyaltyPoints < points) throw new Error('Insufficient points');

      const discountCents = Math.floor(points * program.redemptionRate);
      const newBalance = customer.loyaltyPoints - points;

      await tx.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: newBalance },
      });

      await tx.loyaltyTransaction.create({
        data: {
          customerId,
          saleId,
          type: 'REDEEM',
          points: -points,
          balanceAfter: newBalance,
        },
      });

      return { discountCents, balance: newBalance };
    });
  }

  async getCustomerPoints(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });

    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      balance: customer.loyaltyPoints,
      transactions,
    };
  }

  // ─── Tier CRUD ─────────────────────────────────────────────────────────────

  async createTier(data: {
    businessId: string;
    name: string;
    minPoints: number;
    multiplier: number;
    color: string;
    perksJson?: string;
  }) {
    return this.prisma.loyaltyTier.create({ data });
  }

  async getTiers(businessId: string) {
    return this.prisma.loyaltyTier.findMany({
      where: { businessId },
      orderBy: { minPoints: 'asc' },
    });
  }

  async updateTier(id: string, data: Partial<{
    name: string;
    minPoints: number;
    multiplier: number;
    color: string;
    perksJson: string;
  }>) {
    return this.prisma.loyaltyTier.update({ where: { id }, data });
  }

  async deleteTier(id: string) {
    return this.prisma.loyaltyTier.delete({ where: { id } });
  }

  async getCustomerTier(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return null;
    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { businessId: customer.businessId },
      orderBy: { minPoints: 'desc' },
    });
    return tiers.find((t) => customer.loyaltyPoints >= t.minPoints) ?? null;
  }
}
