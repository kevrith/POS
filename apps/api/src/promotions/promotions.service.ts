import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromotionsService {
  constructor(private prisma: PrismaService) {}

  async createPromotion(data: {
    businessId: string;
    name: string;
    type: string;
    discountType: string;
    discountValue: number;
    minPurchaseCents?: number;
    maxDiscountCents?: number;
    startDate: Date;
    endDate: Date;
    applicableItems?: string[];
  }) {
    return this.prisma.promotion.create({
      data: {
        ...data,
        applicableItems: JSON.stringify(data.applicableItems || []),
      },
    });
  }

  async getActivePromotions(businessId: string) {
    const now = new Date();
    return this.prisma.promotion.findMany({
      where: {
        businessId,
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
  }

  async applyPromotion(promotionId: string, subtotalCents: number, itemIds: string[]) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion) throw new NotFoundException('Promotion not found');
    if (!promotion.isActive) return 0;

    const now = new Date();
    if (now < promotion.startDate || now > promotion.endDate) return 0;

    if (promotion.minPurchaseCents && subtotalCents < promotion.minPurchaseCents) return 0;

    const parsedItems: string[] = JSON.parse(promotion.applicableItems || '[]');
    if (parsedItems.length > 0) {
      const hasApplicableItem = itemIds.some(id => parsedItems.includes(id));
      if (!hasApplicableItem) return 0;
    }

    let discountCents = 0;
    if (promotion.discountType === 'PERCENTAGE') {
      discountCents = Math.round((subtotalCents * promotion.discountValue) / 100);
    } else {
      discountCents = promotion.discountValue;
    }

    if (promotion.maxDiscountCents && discountCents > promotion.maxDiscountCents) {
      discountCents = promotion.maxDiscountCents;
    }

    return discountCents;
  }

  async updatePromotion(id: string, data: Partial<{
    name: string;
    isActive: boolean;
    endDate: Date;
  }>) {
    return this.prisma.promotion.update({
      where: { id },
      data,
    });
  }

  async getPromotions(businessId: string) {
    return this.prisma.promotion.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deletePromotion(id: string) {
    return this.prisma.promotion.delete({ where: { id } });
  }
}
