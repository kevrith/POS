import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string }> {
    const admin = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwt.sign(
      { sub: admin.id, email: admin.email, role: 'SUPER_ADMIN' },
      { secret: process.env.SUPER_ADMIN_SECRET ?? 'super-admin-change-me', expiresIn: '8h' },
    );

    return { token };
  }

  /** Bootstrap first super admin from env vars (called on module init) */
  async ensureDefaultAdmin() {
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!email || !password) return;

    const existing = await this.prisma.superAdmin.findUnique({ where: { email } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.superAdmin.create({
      data: { id: uuidv4(), email, name: 'Super Admin', passwordHash },
    });
    this.logger.log(`Super admin created: ${email}`);
  }

  async listBusinesses(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search ? { name: { contains: search } } : {};

    const [businesses, total] = await Promise.all([
      this.prisma.business.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, stores: true } },
          users: { where: { role: 'OWNER' }, select: { email: true, name: true }, take: 1 },
        },
      }),
      this.prisma.business.count({ where }),
    ]);

    return { businesses, total, page, limit };
  }

  async getPlatformStats() {
    const since30d = new Date(Date.now() - 30 * 86400000);
    const [
      totalBusinesses,
      activeSubscriptions,
      trialBusinesses,
      expiredBusinesses,
      totalUsers,
      totalSalesAmount,
      sales30d,
      newBusinesses30d,
      referralsConverted,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      this.prisma.business.count({ where: { subscriptionStatus: 'TRIAL' } }),
      this.prisma.business.count({ where: { subscriptionStatus: 'EXPIRED' } }),
      this.prisma.user.count(),
      this.prisma.sale.aggregate({ where: { status: 'PAID' }, _sum: { totalCents: true } }),
      this.prisma.sale.aggregate({ where: { status: 'PAID', createdAt: { gte: since30d } }, _sum: { totalCents: true } }),
      this.prisma.business.count({ where: { createdAt: { gte: since30d } } }),
      this.prisma.referral.count({ where: { status: 'CONVERTED' } }),
    ]);

    // Rough MRR: active businesses × average plan price (KES 3,000/mo)
    const avgPlanPriceCents = 300000; // KES 3,000
    const estimatedMRRCents = activeSubscriptions * avgPlanPriceCents;

    return {
      totalBusinesses,
      activeSubscriptions,
      trialBusinesses,
      expiredBusinesses,
      totalUsers,
      totalGMVCents: totalSalesAmount._sum.totalCents ?? 0,
      gmv30dCents: sales30d._sum.totalCents ?? 0,
      newBusinesses30d,
      referralsConverted,
      estimatedMRRCents,
      estimatedARRCents: estimatedMRRCents * 12,
    };
  }

  async updateBusinessSubscription(businessId: string, data: {
    subscriptionStatus?: string;
    subscriptionTier?: string;
    planName?: string;
    trialEndsAt?: Date;
  }) {
    return this.prisma.business.update({
      where: { id: businessId },
      data,
    });
  }

  /** Issue a short-lived JWT for a business owner — allows super admin to impersonate */
  async impersonate(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: { users: { where: { role: 'OWNER' }, take: 1 }, stores: { take: 1 } },
    });
    if (!business) throw new BadRequestException('Business not found');

    const owner = business.users[0];
    if (!owner) throw new BadRequestException('No owner found for this business');

    const token = this.jwt.sign(
      { sub: owner.id, businessId, role: owner.role, storeId: business.stores[0]?.id, impersonated: true },
      { secret: process.env.JWT_SECRET ?? 'jwt-secret', expiresIn: '1h' },
    );

    return { token, businessName: business.name, ownerEmail: owner.email };
  }

  // ── License Keys ─────────────────────────────────────────────────────────

  async listLicenseKeys(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [keys, total] = await Promise.all([
      this.prisma.licenseKey.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.licenseKey.count(),
    ]);
    return { keys, total };
  }

  /**
   * Build a machine-bound KPS license key.
   *
   * Format: KPS-XXXXXXXX-XXXXXXXX-XXXXXXXX  (31 chars, all hex)
   *   seg1 = 8 random hex chars
   *   seg2 = 8 random hex chars
   *   key_slice = seg1 + "-" + seg2[0..7]   (16 chars, matching Rust key[4..20])
   *   seg3 = sha256(machineId + ":" + key_slice)[0..8]
   *
   * If machineId is omitted a random seg3 is used (non-verifiable offline).
   */
  private buildLicenseKey(machineId?: string): string {
    const seg1 = randomBytes(4).toString('hex');
    const seg2 = randomBytes(4).toString('hex');
    const keySlice = `${seg1}-${seg2.slice(0, 7)}`; // 16 chars: seg1[8] + '-' + seg2[0..7]
    let seg3: string;
    if (machineId) {
      seg3 = createHash('sha256')
        .update(`${machineId}:${keySlice}`)
        .digest('hex')
        .slice(0, 8);
    } else {
      seg3 = randomBytes(4).toString('hex');
    }
    return `KPS-${seg1}-${seg2}-${seg3}`;
  }

  async createLicenseKey(data: { tier: string; expiresAt?: Date; machineId?: string }) {
    const key = this.buildLicenseKey(data.machineId);
    return this.prisma.licenseKey.create({
      data: {
        key,
        tier: data.tier,
        expiresAt: data.expiresAt,
      },
    });
  }

  /** Generate a machine-bound key without persisting it (preview / CLI use). */
  generateKeyPreview(machineId: string, tier: string): { key: string; tier: string; machineId: string } {
    return { key: this.buildLicenseKey(machineId), tier, machineId };
  }

  async revokeLicenseKey(id: string) {
    return this.prisma.licenseKey.update({ where: { id }, data: { isActive: false } });
  }

  async getRecentSignups(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return this.prisma.business.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { users: { where: { role: 'OWNER' }, select: { email: true, name: true }, take: 1 } },
    });
  }

  // ── Health Dashboard ──────────────────────────────────────────────────────

  async getSystemHealth() {
    const [
      totalBusinesses,
      activeBusinesses,
      pendingEtims,
      totalEtims24h,
      webhookFailures,
      sales24h,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({
        where: { subscriptionStatus: { not: 'CANCELLED' } },
      }),
      this.prisma.sale.count({
        where: {
          etimsSubmitted: false,
          status: { in: ['PAID', 'AMENDED'] },
          type: 'NORMAL',
        },
      }),
      this.prisma.sale.count({
        where: {
          type: 'NORMAL',
          status: { in: ['PAID', 'AMENDED'] },
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
      }),
      this.prisma.webhook.aggregate({ _sum: { failureCount: true } }),
      this.prisma.sale.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 86400000) },
          status: { in: ['PAID', 'AMENDED'] },
        },
      }),
    ]);

    return {
      totalBusinesses,
      activeBusinesses,
      pendingEtimsCount: pendingEtims,
      etimsFailureRate:
        totalEtims24h > 0 ? Math.round((pendingEtims / totalEtims24h) * 100) : 0,
      webhookFailureCount: webhookFailures._sum.failureCount ?? 0,
      sales24h,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Business Support View ─────────────────────────────────────────────────

  async getBusinessData(businessId: string) {
    const since30d = new Date(Date.now() - 30 * 86400000);
    const [business, recentSales, users, itemCount, storeCount, recentSalesCount, recentGMV] = await Promise.all([
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          planName: true,
          trialEndsAt: true,
          createdAt: true,
        },
      }),
      this.prisma.sale.findMany({
        where: { businessId, status: { in: ['PAID', 'AMENDED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, receiptNumber: true, totalCents: true, createdAt: true, type: true, status: true },
      }),
      this.prisma.user.findMany({
        where: { businessId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.item.count({ where: { businessId, deletedAt: null } }),
      this.prisma.store.count({ where: { businessId } }),
      this.prisma.sale.count({ where: { businessId, status: { in: ['PAID', 'AMENDED'] }, createdAt: { gte: since30d } } }),
      this.prisma.sale.aggregate({ where: { businessId, status: { in: ['PAID', 'AMENDED'] }, createdAt: { gte: since30d } }, _sum: { totalCents: true } }),
    ]);

    return {
      business,
      recentSales,
      users,
      itemCount,
      storeCount,
      userCount: users.length,
      recentSalesCount,
      recentGMVCents: recentGMV._sum.totalCents ?? 0,
    };
  }

  async listReferrals(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [referrals, total] = await Promise.all([
      this.prisma.referral.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          referrer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.referral.count(),
    ]);
    const stats = await this.prisma.referral.groupBy({
      by: ['status'],
      _count: { id: true },
    });
    return { referrals, total, stats };
  }

  // ── Force Update Notifications ────────────────────────────────────────────

  async triggerForceUpdate(version: string, message: string, isRequired = true) {
    const businesses = await this.prisma.business.findMany({ select: { id: true } });

    await Promise.all(
      businesses.map((biz) =>
        this.prisma.notification.create({
          data: {
            businessId: biz.id,
            type: 'FORCE_UPDATE',
            priority: isRequired ? 'HIGH' : 'MEDIUM',
            title: `App Update Available: v${version}`,
            body: message,
            entityType: 'System',
            entityId: version,
          },
        }),
      ),
    );

    return { sent: businesses.length, version, message };
  }

  async checkForUpdate() {
    const latest = await this.prisma.notification.findFirst({
      where: { type: 'FORCE_UPDATE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) return { updateAvailable: false };

    return {
      updateAvailable: true,
      version: latest.entityId,
      message: latest.body,
      isRequired: latest.priority === 'HIGH',
    };
  }
}
