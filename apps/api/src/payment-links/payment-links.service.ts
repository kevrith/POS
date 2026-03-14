import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function randomCode(): string {
  return 'PAY-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

@Injectable()
export class PaymentLinksService {
  constructor(private prisma: PrismaService) {}

  async create(dto: {
    businessId: string;
    storeId?: string;
    description: string;
    amountCents?: number;
    currency?: string;
    expiresAt?: string;
    maxUses?: number;
    createdBy: string;
  }) {
    let code = randomCode();
    // Ensure uniqueness
    while (await this.prisma.paymentLink.findUnique({ where: { code } })) {
      code = randomCode();
    }
    return this.prisma.paymentLink.create({
      data: {
        code,
        businessId: dto.businessId,
        storeId: dto.storeId,
        description: dto.description,
        amountCents: dto.amountCents ?? 0,
        currency: dto.currency ?? 'KES',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        maxUses: dto.maxUses,
        createdBy: dto.createdBy,
      },
    });
  }

  async list(businessId: string) {
    return this.prisma.paymentLink.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByCode(code: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { code } });
    if (!link) throw new NotFoundException('Payment link not found');
    if (link.status !== 'ACTIVE') throw new NotFoundException('Payment link is inactive');
    if (link.expiresAt && link.expiresAt < new Date()) {
      await this.prisma.paymentLink.update({ where: { code }, data: { status: 'EXPIRED' } });
      throw new NotFoundException('Payment link has expired');
    }
    return link;
  }

  async recordPayment(code: string, amountCents: number, method: string, reference?: string) {
    const link = await this.getByCode(code);
    await this.prisma.paymentLink.update({
      where: { code },
      data: {
        usesCount: { increment: 1 },
        ...(link.maxUses && link.usesCount + 1 >= link.maxUses ? { status: 'EXPIRED' } : {}),
      },
    });
    return { success: true, linkId: link.id, amountCents, method, reference };
  }

  async disable(id: string) {
    return this.prisma.paymentLink.update({ where: { id }, data: { status: 'DISABLED' } });
  }
}
