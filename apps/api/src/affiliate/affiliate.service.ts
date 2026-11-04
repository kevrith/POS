import { Injectable, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { frontendUrl } from '../common/app-urls';

interface AffiliateTokenPayload { sub: string; role: 'AFFILIATE'; code: string }

const fmtKES = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

@Injectable()
export class AffiliateService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private email: EmailService,
  ) {}

  private sign(a: { id: string; code: string }): string {
    const payload: AffiliateTokenPayload = { sub: a.id, role: 'AFFILIATE', code: a.code };
    return this.jwt.sign(payload, { expiresIn: '30d' });
  }

  private async generateCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 6; i++) {
      const code = 'AFF-' + Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
      const exists = await this.prisma.affiliate.findUnique({ where: { code } });
      if (!exists) return code;
    }
    return 'AFF-' + uuidv4().slice(0, 8).toUpperCase();
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  async register(dto: { name: string; email: string; phone?: string; password: string }) {
    const email = dto.email?.trim().toLowerCase();
    if (!dto.name?.trim() || !email || !dto.password || dto.password.length < 6) {
      throw new BadRequestException('Name, email and a 6+ character password are required');
    }
    const existing = await this.prisma.affiliate.findUnique({ where: { email } });
    if (existing) throw new BadRequestException('An affiliate with this email already exists');

    const affiliate = await this.prisma.affiliate.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        passwordHash: await bcrypt.hash(dto.password, 10),
        code: await this.generateCode(),
        status: 'PENDING',
      },
    });
    return { token: this.sign(affiliate), affiliate: this.publicShape(affiliate) };
  }

  async login(dto: { email: string; password: string }) {
    const email = dto.email?.trim().toLowerCase();
    const affiliate = await this.prisma.affiliate.findUnique({ where: { email } });
    if (!affiliate || !(await bcrypt.compare(dto.password, affiliate.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return { token: this.sign(affiliate), affiliate: this.publicShape(affiliate) };
  }

  private static webBase(): string {
    return frontendUrl();
  }

  /**
   * The referral link an affiliate shares publicly. Built server-side from
   * FRONTEND_URL so it is always the canonical origin: the portal is reachable
   * on fallback hosts too, and a link built from window.location.origin there
   * would be copied into WhatsApp and social posts pinned to the wrong host.
   */
  static referralUrl(code: string): string {
    return `${AffiliateService.webBase()}/?mode=register&aff=${code}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private publicShape(a: any) {
    return {
      id: a.id, name: a.name, email: a.email, phone: a.phone, code: a.code,
      status: a.status, commissionPercent: a.commissionPercent,
      payoutMethod: a.payoutMethod, payoutDetails: a.payoutDetails,
      balanceCents: a.balanceCents, totalEarnedCents: a.totalEarnedCents,
      referralLink: AffiliateService.referralUrl(a.code),
    };
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  async getMe(affiliateId: string) {
    const a = await this.prisma.affiliate.findUnique({ where: { id: affiliateId } });
    if (!a) throw new NotFoundException('Affiliate not found');
    const [signups, subscribed] = await Promise.all([
      this.prisma.affiliateConversion.count({ where: { affiliateId } }),
      this.prisma.affiliateConversion.count({ where: { affiliateId, status: 'SUBSCRIBED' } }),
    ]);
    const paidAgg = await this.prisma.affiliatePayout.aggregate({ where: { affiliateId }, _sum: { amountCents: true } });
    return {
      ...this.publicShape(a),
      stats: {
        signups,
        subscribed,
        paidOutCents: paidAgg._sum.amountCents ?? 0,
        balanceCents: a.balanceCents,
        totalEarnedCents: a.totalEarnedCents,
      },
    };
  }

  async updateProfile(affiliateId: string, dto: { payoutMethod?: string; payoutDetails?: string }) {
    return this.prisma.affiliate.update({
      where: { id: affiliateId },
      data: {
        ...(dto.payoutMethod !== undefined && { payoutMethod: dto.payoutMethod }),
        ...(dto.payoutDetails !== undefined && { payoutDetails: dto.payoutDetails }),
      },
      select: { id: true, payoutMethod: true, payoutDetails: true },
    });
  }

  async getConversions(affiliateId: string) {
    return this.prisma.affiliateConversion.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getCommissions(affiliateId: string) {
    return this.prisma.affiliateCommission.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPayouts(affiliateId: string) {
    return this.prisma.affiliatePayout.findMany({
      where: { affiliateId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ── Attribution + commission (called from registration / subscription) ──────

  /** Attribute a newly-registered business to an affiliate if the code is valid + active. */
  async attributeSignup(code: string, businessId: string): Promise<void> {
    if (!code?.trim()) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { code: code.trim() } });
    if (!affiliate || affiliate.status !== 'ACTIVE') return; // silently ignore unknown/inactive
    const existing = await this.prisma.affiliateConversion.findUnique({ where: { businessId } });
    if (existing) return; // one business → one affiliate
    await this.prisma.$transaction([
      this.prisma.affiliateConversion.create({ data: { affiliateId: affiliate.id, businessId, status: 'SIGNED_UP' } }),
      this.prisma.business.update({ where: { id: businessId }, data: { affiliateCode: affiliate.code } }),
    ]);
  }

  /** Record a recurring commission when a referred business pays for a subscription. */
  async recordSubscriptionCommission(businessId: string, paidCents: number): Promise<void> {
    if (!paidCents || paidCents <= 0) return;
    const conversion = await this.prisma.affiliateConversion.findUnique({ where: { businessId } });
    if (!conversion) return;
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id: conversion.affiliateId } });
    if (!affiliate || affiliate.status !== 'ACTIVE') return;

    const amountCents = Math.round((paidCents * affiliate.commissionPercent) / 100);
    if (amountCents <= 0) return;

    await this.prisma.$transaction([
      this.prisma.affiliateCommission.create({
        data: { affiliateId: affiliate.id, businessId, amountCents, baseCents: paidCents, percent: affiliate.commissionPercent, status: 'PENDING' },
      }),
      this.prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { balanceCents: { increment: amountCents }, totalEarnedCents: { increment: amountCents } },
      }),
      ...(conversion.status !== 'SUBSCRIBED'
        ? [this.prisma.affiliateConversion.update({ where: { id: conversion.id }, data: { status: 'SUBSCRIBED', subscribedAt: new Date() } })]
        : []),
    ]);

    // Notify the affiliate they earned a commission.
    const business = await this.prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    this.email
      .sendAffiliateCommission({
        to: affiliate.email,
        name: affiliate.name,
        amount: fmtKES(amountCents),
        businessName: business?.name ?? 'A business',
        balance: fmtKES(affiliate.balanceCents + amountCents),
      })
      .catch(() => {});
  }

  // ── Admin (super-admin) ─────────────────────────────────────────────────────
  async adminList(status?: string) {
    return this.prisma.affiliate.findMany({
      where: status && status !== 'ALL' ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { conversions: true } } },
    });
  }

  async adminGet(id: string) {
    const a = await this.prisma.affiliate.findUnique({
      where: { id },
      include: { conversions: { orderBy: { createdAt: 'desc' }, take: 100 }, payouts: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!a) throw new NotFoundException('Affiliate not found');
    return a;
  }

  async adminSetStatus(id: string, status: string, commissionPercent?: number) {
    const valid = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'];
    if (!valid.includes(status)) throw new BadRequestException('Invalid status');
    const before = await this.prisma.affiliate.findUnique({ where: { id } });
    const updated = await this.prisma.affiliate.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACTIVE' && { approvedAt: new Date() }),
        ...(commissionPercent !== undefined && { commissionPercent }),
      },
    });

    // Email the affiliate the first time they're approved.
    if (status === 'ACTIVE' && before?.status !== 'ACTIVE') {
      const link = AffiliateService.referralUrl(updated.code);
      this.email
        .sendAffiliateApproved({ to: updated.email, name: updated.name, code: updated.code, link, commissionPercent: updated.commissionPercent })
        .catch(() => {});
    }
    return updated;
  }

  /** Record a manual payout: creates the record, clears matching PENDING commissions, decrements balance. */
  async adminRecordPayout(id: string, dto: { amountCents: number; method?: string; reference?: string; notes?: string }) {
    const affiliate = await this.prisma.affiliate.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Affiliate not found');
    if (!dto.amountCents || dto.amountCents <= 0) throw new BadRequestException('Payout amount must be positive');
    if (dto.amountCents > affiliate.balanceCents) throw new BadRequestException('Payout exceeds the affiliate balance');

    const payout = await this.prisma.affiliatePayout.create({
      data: { affiliateId: id, amountCents: dto.amountCents, method: dto.method, reference: dto.reference, notes: dto.notes },
    });
    await this.prisma.$transaction([
      this.prisma.affiliate.update({ where: { id }, data: { balanceCents: { decrement: dto.amountCents } } }),
      this.prisma.affiliateCommission.updateMany({ where: { affiliateId: id, status: 'PENDING' }, data: { status: 'PAID', payoutId: payout.id } }),
    ]);

    // Send the affiliate a payout receipt.
    this.email
      .sendAffiliatePayout({
        to: affiliate.email,
        name: affiliate.name,
        amount: fmtKES(dto.amountCents),
        method: dto.method ?? affiliate.payoutMethod ?? '—',
        reference: dto.reference ?? '',
        balance: fmtKES(Math.max(0, affiliate.balanceCents - dto.amountCents)),
      })
      .catch(() => {});
    return payout;
  }
}
