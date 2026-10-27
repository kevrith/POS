import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { requireString } from '../common/validate';

@Injectable()
export class FranchiseService {
  constructor(private prisma: PrismaService) {}

  async linkFranchisee(
    franchiseeId: string,
    parentBusinessId: string,
    franchiseFee: number,
    royaltyRate: number,
  ) {
    requireString(franchiseeId, 'franchiseeId');
    requireString(parentBusinessId, 'parentBusinessId');
    const [franchisee, parent] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: franchiseeId } }),
      this.prisma.business.findUnique({ where: { id: parentBusinessId } }),
    ]);
    if (!franchisee) throw new NotFoundException('Franchisee business not found');
    if (!parent) throw new NotFoundException('Parent business not found');
    if (franchiseeId === parentBusinessId)
      throw new BadRequestException('Cannot link business to itself');
    return this.prisma.business.update({
      where: { id: franchiseeId },
      data: { parentBusinessId, franchiseFee, royaltyRate },
    });
  }

  async unlinkFranchisee(franchiseeId: string) {
    return this.prisma.business.update({
      where: { id: franchiseeId },
      data: { parentBusinessId: null, franchiseFee: 0, royaltyRate: 0 },
    });
  }

  async getNetwork(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        franchisees: { include: { stores: true } },
        parentBusiness: { select: { id: true, name: true } },
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const franchiseeStats = await Promise.all(
      (business.franchisees || []).map(async (f) => {
        const [salesAgg, userCount] = await Promise.all([
          this.prisma.sale.aggregate({
            where: {
              businessId: f.id,
              status: { in: ['PAID', 'COMPLETED'] },
              createdAt: { gte: monthStart },
            },
            _sum: { totalCents: true },
            _count: { id: true },
          }),
          this.prisma.user.count({ where: { businessId: f.id } }),
        ]);
        const gmvCents = salesAgg._sum.totalCents ?? 0;
        const feeCents = Math.round(gmvCents * ((f.franchiseFee ?? 0) / 100));
        const royaltyCents = Math.round(gmvCents * ((f.royaltyRate ?? 0) / 100));
        return {
          id: f.id,
          name: f.name,
          planName: (f as any).planName ?? 'STARTER',
          storeCount: f.stores.length,
          userCount,
          monthlyGMVCents: gmvCents,
          feeCents,
          royaltyCents,
          salesCount: salesAgg._count.id,
          franchiseFee: f.franchiseFee,
          royaltyRate: f.royaltyRate,
        };
      }),
    );

    return {
      business: {
        id: business.id,
        name: business.name,
        parentBusiness: (business as any).parentBusiness,
      },
      franchisees: franchiseeStats,
    };
  }

  async getDashboard(businessId: string) {
    const network = await this.getNetwork(businessId);
    const totalGMVCents = network.franchisees.reduce((s, f) => s + f.monthlyGMVCents, 0);
    const totalFeeCents = network.franchisees.reduce((s, f) => s + f.feeCents, 0);
    const totalRoyaltyCents = network.franchisees.reduce((s, f) => s + f.royaltyCents, 0);
    const totalSales = network.franchisees.reduce((s, f) => s + f.salesCount, 0);
    const avgGMV =
      network.franchisees.length > 0 ? totalGMVCents / network.franchisees.length : 0;

    const performance = network.franchisees
      .map((f) => ({
        ...f,
        performanceRatio: avgGMV > 0 ? f.monthlyGMVCents / avgGMV : 0,
      }))
      .sort((a, b) => b.monthlyGMVCents - a.monthlyGMVCents);

    return {
      totalFranchisees: network.franchisees.length,
      totalGMVCents,
      totalFeeCents,
      totalRoyaltyCents,
      totalSales,
      avgGMVCents: Math.round(avgGMV),
      franchiseePerformance: performance,
    };
  }

  async getSettings(businessId: string) {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        franchiseFee: true,
        royaltyRate: true,
        parentBusinessId: true,
        parentBusiness: { select: { id: true, name: true } },
      },
    });
    if (!biz) throw new NotFoundException('Business not found');
    return biz;
  }

  async updateSettings(businessId: string, franchiseFee: number, royaltyRate: number) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: { franchiseFee, royaltyRate },
    });
  }
}
