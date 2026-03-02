import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ReferralsService {
  private readonly REWARD_CENTS = 50000; // KES 500 reward per successful referral

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /** Get or create a referral code for a business */
  async getOrCreateReferralCode(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { referralCode: true, name: true },
    });
    if (!business) throw new BadRequestException('Business not found');

    if (business.referralCode) return business.referralCode;

    // Generate unique code: KAS-XXXXXX
    let code: string;
    let attempts = 0;
    do {
      code = `KAS-${uuidv4().toUpperCase().replace(/-/g, '').slice(0, 6)}`;
      const existing = await this.prisma.business.findUnique({ where: { referralCode: code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    await this.prisma.business.update({ where: { id: businessId }, data: { referralCode: code } });
    return code;
  }

  async listReferrals(businessId: string) {
    return this.prisma.referral.findMany({
      where: { referrerBusinessId: businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getReferralStats(businessId: string) {
    const [total, converted, pending, rewarded] = await Promise.all([
      this.prisma.referral.count({ where: { referrerBusinessId: businessId } }),
      this.prisma.referral.count({ where: { referrerBusinessId: businessId, status: 'CONVERTED' } }),
      this.prisma.referral.count({ where: { referrerBusinessId: businessId, status: 'PENDING' } }),
      this.prisma.referral.count({ where: { referrerBusinessId: businessId, status: 'REWARDED' } }),
    ]);
    const totalRewardCents = (converted + rewarded) * this.REWARD_CENTS;
    return { total, converted, pending, rewarded, totalRewardCents };
  }

  /** Called during business registration if a referral code is provided */
  async applyReferralCode(code: string, newBusinessId: string): Promise<void> {
    const referrer = await this.prisma.business.findUnique({
      where: { referralCode: code },
      include: { users: { where: { role: 'OWNER' }, take: 1 } },
    });
    if (!referrer) return; // Silently ignore invalid codes

    // Don't allow self-referral
    if (referrer.id === newBusinessId) return;

    await this.prisma.referral.create({
      data: {
        id: uuidv4(),
        referrerBusinessId: referrer.id,
        referredBusinessId: newBusinessId,
        code,
        status: 'PENDING',
        rewardCents: this.REWARD_CENTS,
      },
    });
  }

  /** Called when a referred business makes its first paid subscription */
  async convertReferral(referredBusinessId: string): Promise<void> {
    const referral = await this.prisma.referral.findFirst({
      where: { referredBusinessId, status: 'PENDING' },
      include: { referrer: { include: { users: { where: { role: 'OWNER' }, take: 1 } } } },
    });
    if (!referral) return;

    const newBusiness = await this.prisma.business.findUnique({
      where: { id: referredBusinessId },
      select: { name: true },
    });

    await this.prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'REWARDED' },
    });

    // Notify referrer
    const ownerEmail = referral.referrer.users[0]?.email;
    if (ownerEmail) {
      await this.email.sendReferralReward({
        to: ownerEmail,
        businessName: referral.referrer.name,
        rewardAmount: `KES ${(referral.rewardCents / 100).toLocaleString()}`,
        referredBusiness: newBusiness?.name ?? referredBusinessId,
      });
    }
  }

  /** Validate a license key and apply it to a business */
  async activateLicenseKey(businessId: string, key: string) {
    const license = await this.prisma.licenseKey.findUnique({ where: { key } });
    if (!license || !license.isActive) throw new BadRequestException('Invalid or inactive license key');
    if (license.businessId && license.businessId !== businessId) {
      throw new BadRequestException('License key already used by another business');
    }
    if (license.expiresAt && new Date() > license.expiresAt) {
      throw new BadRequestException('License key has expired');
    }

    await Promise.all([
      this.prisma.licenseKey.update({
        where: { key },
        data: { businessId, activatedAt: new Date() },
      }),
      this.prisma.business.update({
        where: { id: businessId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionTier: license.tier,
          planName: license.tier,
          trialEndsAt: license.expiresAt,
        },
      }),
    ]);

    return { activated: true, tier: license.tier, expiresAt: license.expiresAt };
  }
}
