import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GiftCardsService {
  constructor(private prisma: PrismaService) {}

  private generateCode(): string {
    return 'GC' + Math.random().toString(36).substring(2, 12).toUpperCase();
  }

  async createGiftCard(data: {
    businessId: string;
    initialValueCents: number;
    purchasedBy?: string;
  }) {
    return this.prisma.giftCard.create({
      data: {
        businessId: data.businessId,
        code: this.generateCode(),
        initialValueCents: data.initialValueCents,
        balanceCents: data.initialValueCents,
        purchasedBy: data.purchasedBy,
        status: 'ACTIVE',
      },
    });
  }

  async getGiftCard(code: string) {
    return this.prisma.giftCard.findUnique({
      where: { code },
      include: { transactions: { orderBy: { createdAt: 'desc' } } },
    });
  }

  async redeemGiftCard(code: string, amountCents: number, saleId: string) {
    const giftCard = await this.prisma.giftCard.findUnique({
      where: { code },
    });

    if (giftCard.status !== 'ACTIVE') {
      throw new BadRequestException('Gift card is not active');
    }

    if (giftCard.balanceCents < amountCents) {
      throw new BadRequestException('Insufficient gift card balance');
    }

    const newBalance = giftCard.balanceCents - amountCents;

    await this.prisma.giftCard.update({
      where: { code },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? 'REDEEMED' : 'ACTIVE',
      },
    });

    await this.prisma.giftCardTransaction.create({
      data: {
        giftCardId: giftCard.id,
        saleId,
        type: 'REDEMPTION',
        amountCents: -amountCents,
        balanceAfterCents: newBalance,
      },
    });

    return { balanceCents: newBalance };
  }

  async topUpGiftCard(code: string, amountCents: number) {
    const giftCard = await this.prisma.giftCard.findUnique({
      where: { code },
    });

    const newBalance = giftCard.balanceCents + amountCents;

    await this.prisma.giftCard.update({
      where: { code },
      data: {
        balanceCents: newBalance,
        status: 'ACTIVE',
      },
    });

    await this.prisma.giftCardTransaction.create({
      data: {
        giftCardId: giftCard.id,
        type: 'TOP_UP',
        amountCents,
        balanceAfterCents: newBalance,
      },
    });

    return { balanceCents: newBalance };
  }

  async getGiftCards(businessId: string, status?: string) {
    return this.prisma.giftCard.findMany({
      where: {
        businessId,
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
