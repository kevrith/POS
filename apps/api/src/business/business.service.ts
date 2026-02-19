import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface UpdateBusinessDto {
  name?: string;
  taxType?: 'VAT' | 'TOT';
  serviceChargeRate?: number;
  negativePolicyDefault?: 'BLOCK' | 'WARN' | 'ALLOW';
  posMode?: string;
  expiredItemPolicy?: string;
  expenseApprovalThresholdCents?: number;
}

interface CreateStoreDto {
  name: string;
  storeCode: string;
}

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        stores: { where: { id: { not: undefined } } },
        users: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async updateSettings(businessId: string, dto: UpdateBusinessDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) throw new NotFoundException('Business not found');

    return this.prisma.business.update({
      where: { id: businessId },
      data: dto,
    });
  }

  async getStores(businessId: string) {
    return this.prisma.store.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async createStore(businessId: string, dto: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        businessId,
        name: dto.name,
        storeCode: dto.storeCode.toUpperCase(),
      },
    });
  }

  async getSubscriptionStatus(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });

    if (!business) throw new NotFoundException('Business not found');

    const isTrialExpired =
      business.subscriptionStatus === 'TRIAL' &&
      business.trialEndsAt &&
      new Date() > business.trialEndsAt;

    return {
      ...business,
      isTrialExpired,
      daysRemaining: business.trialEndsAt
        ? Math.max(
            0,
            Math.ceil(
              (business.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null,
    };
  }
}
