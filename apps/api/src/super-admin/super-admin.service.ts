import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

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
    const [
      totalBusinesses,
      activeSubscriptions,
      trialBusinesses,
      expiredBusinesses,
      totalUsers,
      totalSalesAmount,
    ] = await Promise.all([
      this.prisma.business.count(),
      this.prisma.business.count({ where: { subscriptionStatus: 'ACTIVE' } }),
      this.prisma.business.count({ where: { subscriptionStatus: 'TRIAL' } }),
      this.prisma.business.count({ where: { subscriptionStatus: 'EXPIRED' } }),
      this.prisma.user.count(),
      this.prisma.sale.aggregate({ where: { status: 'PAID' }, _sum: { totalCents: true } }),
    ]);

    return {
      totalBusinesses,
      activeSubscriptions,
      trialBusinesses,
      expiredBusinesses,
      totalUsers,
      totalGMVCents: totalSalesAmount._sum.totalCents ?? 0,
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

  async createLicenseKey(data: { tier: string; expiresAt?: Date }) {
    const key = `KPS-${uuidv4().toUpperCase().replace(/-/g, '').slice(0, 20)}`;
    return this.prisma.licenseKey.create({
      data: { key, tier: data.tier, expiresAt: data.expiresAt },
    });
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
    const [business, recentSales, users, itemCount] = await Promise.all([
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
        select: {
          id: true,
          receiptNumber: true,
          totalCents: true,
          createdAt: true,
          type: true,
        },
      }),
      this.prisma.user.findMany({
        where: { businessId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.item.count({ where: { businessId, deletedAt: null } }),
    ]);

    return { business, recentSales, users, itemCount };
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
