import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MpesaService } from '../payments/mpesa.service';

/**
 * Shareable payment links.
 *
 * This is the single owner of `/payments/links/*`. An earlier duplicate set of
 * handlers lived inline in PaymentsController; whichever module registered first
 * silently won, which meant the link code format and — more seriously — whether
 * "pay" actually charged the customer both depended on module ordering.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 — these get read aloud

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

@Injectable()
export class PaymentLinksService {
  constructor(
    private prisma: PrismaService,
    private mpesa: MpesaService,
  ) {}

  async create(dto: {
    businessId: string;
    storeId?: string;
    description?: string;
    amountCents?: number;
    currency?: string;
    expiresAt?: string;
    maxUses?: number;
    createdBy: string;
  }) {
    if (dto.amountCents !== undefined && dto.amountCents < 0) {
      throw new BadRequestException('Amount cannot be negative');
    }
    if (dto.maxUses !== undefined && dto.maxUses !== null && dto.maxUses < 1) {
      throw new BadRequestException('Max uses must be at least 1');
    }

    // `code` is unique — retry rather than surfacing a constraint violation.
    let code = randomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await this.prisma.paymentLink.findUnique({ where: { code } });
      if (!clash) break;
      code = randomCode();
    }

    return this.prisma.paymentLink.create({
      data: {
        code,
        businessId: dto.businessId,
        storeId: dto.storeId,
        description: dto.description ?? '',
        amountCents: dto.amountCents ?? 0,
        currency: dto.currency ?? 'KES',
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        maxUses: dto.maxUses,
        createdBy: dto.createdBy,
        status: 'ACTIVE',
      },
    });
  }

  async list(businessId: string) {
    return this.prisma.paymentLink.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Loads a link for public use, lazily expiring it when it is past its window. */
  async getByCode(code: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { code } });
    if (!link) throw new NotFoundException('Payment link not found');
    if (link.status !== 'ACTIVE') {
      throw new NotFoundException('This payment link is no longer active');
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      await this.prisma.paymentLink.update({ where: { code }, data: { status: 'EXPIRED' } });
      throw new NotFoundException('This payment link has expired');
    }
    if (link.maxUses && link.usesCount >= link.maxUses) {
      throw new NotFoundException('This payment link has reached its maximum uses');
    }
    return link;
  }

  /** Public view — never leaks internal ids or the owning business id. */
  async getPublicView(code: string) {
    const link = await this.getByCode(code);
    const business = await this.prisma.business.findUnique({
      where: { id: link.businessId },
      select: { name: true },
    });
    return {
      code: link.code,
      description: link.description,
      amountCents: link.amountCents,
      currency: link.currency,
      expiresAt: link.expiresAt,
      maxUses: link.maxUses,
      usesCount: link.usesCount,
      businessName: business?.name ?? 'Merchant',
    };
  }

  /**
   * Charge the payer via M-Pesa STK push. The use count is only incremented once
   * the push has been accepted — incrementing first would burn a single-use link
   * on a failed request.
   */
  async pay(code: string, dto: { phone: string; amountCents?: number }) {
    const link = await this.getByCode(code);

    if (!dto.phone?.trim()) throw new BadRequestException('A phone number is required');

    const amount = link.amountCents > 0 ? link.amountCents : dto.amountCents ?? 0;
    if (!amount || amount <= 0) {
      throw new BadRequestException('Enter an amount to pay for this open link');
    }

    const result = await this.mpesa.initiateSTKPush({
      phone: dto.phone.trim(),
      amountCents: amount,
      accountReference: `PAY-${code}`,
    });

    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: {
        usesCount: { increment: 1 },
        ...(link.maxUses && link.usesCount + 1 >= link.maxUses ? { status: 'EXPIRED' } : {}),
      },
    });

    return result;
  }

  async disable(id: string, businessId: string) {
    const link = await this.prisma.paymentLink.findFirst({ where: { id, businessId } });
    if (!link) throw new NotFoundException('Payment link not found');
    return this.prisma.paymentLink.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }
}
