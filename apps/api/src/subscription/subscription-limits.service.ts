import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionTier, Feature, getFeatureLimit } from '@pos/shared';

interface LimitCheckResult {
  allowed: boolean;
  current: number;
  limit: number | null; // null = unlimited
  message?: string;
}

@Injectable()
export class SubscriptionLimitsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check if business can create a new store based on their tier
   */
  async canCreateStore(businessId: string): Promise<LimitCheckResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionTier: true },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    const tier = (business.subscriptionTier ?? 'FREE') as SubscriptionTier;
    const limit = this.getStoreLimit(tier);
    const current = await this.prisma.store.count({ where: { businessId } });

    if (limit === null) {
      return { allowed: true, current, limit: null };
    }

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit,
        message: `Your ${tier} plan allows ${limit} store${limit > 1 ? 's' : ''}. You currently have ${current}. Upgrade to add more stores.`,
      };
    }

    return { allowed: true, current, limit };
  }

  /**
   * Check if business can create a new user based on their tier
   */
  async canCreateUser(businessId: string): Promise<LimitCheckResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionTier: true },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    const tier = (business.subscriptionTier ?? 'FREE') as SubscriptionTier;
    const limit = this.getUserLimit(tier);
    const current = await this.prisma.user.count({ where: { businessId } });

    if (limit === null) {
      return { allowed: true, current, limit: null };
    }

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit,
        message: `Your ${tier} plan allows ${limit} user${limit > 1 ? 's' : ''}. You currently have ${current}. Upgrade to add more users.`,
      };
    }

    return { allowed: true, current, limit };
  }

  /**
   * Check if FREE tier business has exceeded monthly transaction limit
   */
  async checkMonthlyTransactionLimit(businessId: string): Promise<LimitCheckResult> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionTier: true },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    const tier = (business.subscriptionTier ?? 'FREE') as SubscriptionTier;

    // Only FREE tier has transaction limits
    if (tier !== SubscriptionTier.FREE) {
      return { allowed: true, current: 0, limit: null };
    }

    const limit = getFeatureLimit(tier, Feature.POS) ?? 200;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const current = await this.prisma.sale.count({
      where: {
        businessId,
        createdAt: { gte: monthStart, lt: monthEnd },
        status: { not: 'VOIDED' },
      },
    });

    if (current >= limit) {
      return {
        allowed: false,
        current,
        limit,
        message: `Your FREE plan allows ${limit} transactions per month. You've used ${current}. Upgrade to STARTER for unlimited transactions.`,
      };
    }

    return { allowed: true, current, limit };
  }

  /**
   * Get usage stats for a business (for dashboard display)
   */
  async getUsageStats(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionTier: true },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    const tier = (business.subscriptionTier ?? 'FREE') as SubscriptionTier;

    const [storeCount, userCount] = await Promise.all([
      this.prisma.store.count({ where: { businessId } }),
      this.prisma.user.count({ where: { businessId } }),
    ]);

    let monthlyTxCount = 0;
    let monthlyTxLimit: number | null = null;

    if (tier === SubscriptionTier.FREE) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      monthlyTxCount = await this.prisma.sale.count({
        where: {
          businessId,
          createdAt: { gte: monthStart, lt: monthEnd },
          status: { not: 'VOIDED' },
        },
      });
      monthlyTxLimit = getFeatureLimit(tier, Feature.POS) ?? 200;
    }

    return {
      tier,
      stores: {
        current: storeCount,
        limit: this.getStoreLimit(tier),
      },
      users: {
        current: userCount,
        limit: this.getUserLimit(tier),
      },
      transactions: {
        current: monthlyTxCount,
        limit: monthlyTxLimit,
      },
    };
  }

  private getStoreLimit(tier: SubscriptionTier): number | null {
    const limits: Record<SubscriptionTier, number | null> = {
      [SubscriptionTier.FREE]: 1,
      [SubscriptionTier.STARTER]: 1,
      [SubscriptionTier.GROWTH]: 2,
      [SubscriptionTier.PRO]: 5,
      [SubscriptionTier.ENTERPRISE]: null, // unlimited
    };
    return limits[tier];
  }

  private getUserLimit(tier: SubscriptionTier): number | null {
    const limits: Record<SubscriptionTier, number | null> = {
      [SubscriptionTier.FREE]: 1,
      [SubscriptionTier.STARTER]: 8,
      [SubscriptionTier.GROWTH]: 15,
      [SubscriptionTier.PRO]: 30,
      [SubscriptionTier.ENTERPRISE]: null, // unlimited
    };
    return limits[tier];
  }
}
