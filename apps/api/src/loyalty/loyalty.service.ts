import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async createProgram(data: {
    businessId: string;
    name: string;
    kesPerPoint: number;
    pointValueCents: number;
    minRedemption: number;
  }) {
    return this.prisma.loyaltyProgram.upsert({
      where: { businessId: data.businessId },
      update: { name: data.name, kesPerPoint: data.kesPerPoint, pointValueCents: data.pointValueCents, minRedemption: data.minRedemption, isActive: true },
      create: { ...data, isActive: true },
    });
  }

  async getProgram(businessId: string) {
    return this.prisma.loyaltyProgram.findFirst({
      where: { businessId, isActive: true },
    });
  }

  async earnPoints(customerId: string, saleCents: number, saleId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      console.log('[Loyalty] Customer not found:', customerId);
      return { points: 0, balance: 0, reason: 'CUSTOMER_NOT_FOUND' };
    }

    const program = await this.prisma.loyaltyProgram.findFirst({
      where: { businessId: customer.businessId, isActive: true },
    });
    if (!program) {
      console.log('[Loyalty] No active program for business:', customer.businessId);
      return { points: 0, balance: customer.loyaltyPoints, reason: 'NO_PROGRAM' };
    }

    // Guard: never award twice for the same sale
    const existing = await this.prisma.loyaltyTransaction.findFirst({
      where: { saleId, type: 'EARN' },
    });
    if (existing) {
      console.log('[Loyalty] Points already awarded for sale:', saleId);
      return { points: 0, balance: customer.loyaltyPoints, reason: 'ALREADY_AWARDED' };
    }

    // 1 point per kesPerPoint shillings spent
    const points = Math.floor(saleCents / 100 / program.kesPerPoint);
    console.log(`[Loyalty] Calculating points: ${saleCents / 100} KES / ${program.kesPerPoint} = ${points} points`);
    
    if (points <= 0) {
      return { points: 0, balance: customer.loyaltyPoints, reason: 'BELOW_THRESHOLD' };
    }

    const newBalance = customer.loyaltyPoints + points;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: newBalance },
    });

    await this.prisma.loyaltyTransaction.create({
      data: { customerId, saleId, type: 'EARN', points, balanceAfter: newBalance },
    });

    console.log(`[Loyalty] Awarded ${points} points to customer ${customer.name}. New balance: ${newBalance}`);
    return { points, balance: newBalance, reason: 'SUCCESS' };
  }

  async redeemPoints(customerId: string, points: number, saleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException('Customer not found');

      const program = await tx.loyaltyProgram.findFirst({
        where: { businessId: customer.businessId, isActive: true },
      });
      if (!program) throw new BadRequestException('No active loyalty program');
      if (points < program.minRedemption) throw new BadRequestException('Below minimum redemption');
      if (customer.loyaltyPoints < points) throw new BadRequestException('Insufficient points');

      const discountCents = Math.floor(points * program.pointValueCents);
      const newBalance = customer.loyaltyPoints - points;

      await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } });
      await tx.loyaltyTransaction.create({
        data: { customerId, saleId, type: 'REDEEM', points: -points, balanceAfter: newBalance },
      });

      return { discountCents, balance: newBalance };
    });
  }

  async getCustomerPoints(customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    const transactions = await this.prisma.loyaltyTransaction.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { balance: customer.loyaltyPoints, transactions };
  }

  // ─── Tiers ─────────────────────────────────────────────────────────────────

  async createTier(data: { businessId: string; name: string; minPoints: number; multiplier: number; color: string; perksJson?: string }) {
    return this.prisma.loyaltyTier.create({ data });
  }

  async getTiers(businessId: string) {
    return this.prisma.loyaltyTier.findMany({ where: { businessId }, orderBy: { minPoints: 'asc' } });
  }

  async updateTier(id: string, data: Partial<{ name: string; minPoints: number; multiplier: number; color: string; perksJson: string }>) {
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
