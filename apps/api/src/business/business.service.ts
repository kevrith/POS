import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { createCipheriv, randomBytes } from 'crypto';
import { UserRole } from '@pos/shared';

interface UpdateBusinessDto {
  name?: string;
  taxType?: 'VAT' | 'TOT' | 'NONE';
  totRate?: number;
  serviceChargeRate?: number;
  serviceChargeDefault?: boolean;
  negativePolicyDefault?: 'BLOCK' | 'WARN' | 'ALLOW';
  posMode?: string;
  expiredItemPolicy?: string;
  expenseApprovalThresholdCents?: number;
  expiryAlertDays?: number;
  exchangeRates?: string;    // JSON: { USD: 130.5, EUR: 141.2 }
  displayCurrencies?: string; // JSON: ["USD","EUR"]
  paystackPublicKey?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  bankBranch?: string;
  idleMessage?: string;
  idleLogoUrl?: string;
  tablePrefix?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  enableCashDrawer?: boolean;
  enableBarcodeScanner?: boolean;
  enablePoleDisplay?: boolean;
}

interface CreateStoreDto {
  name: string;
  storeCode: string;
}

interface CreateUserDto {
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  pin?: string;
  password?: string;
}

interface UpdateUserDto {
  name?: string;
  phone?: string;
  role?: UserRole;
  pin?: string;
  password?: string;
}

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  private encrypt(data: object): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '0'.repeat(64), 'hex');
    const iv = randomBytes(16);
    const cipher = createCipheriv(algorithm, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(data)),
      cipher.final(),
    ]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      include: {
        stores: { where: { id: { not: undefined } } },
        users: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!business) throw new NotFoundException('Business not found');

    // Strip encrypted secrets from response
    const { etimsCredentialsEncrypted, mpesaCredentialsEncrypted, atCredentialsEncrypted, ...safe } = business;
    return {
      ...safe,
      hasEtimsCredentials: !!etimsCredentialsEncrypted,
      hasMpesaCredentials: !!mpesaCredentialsEncrypted,
      hasAtCredentials: !!atCredentialsEncrypted,
    };
  }

  async updateSettings(businessId: string, dto: UpdateBusinessDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found');
    return this.prisma.business.update({ where: { id: businessId }, data: dto });
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

  // ─── User Management ─────────────────────────────────────────────────────────

  async getUsers(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        assignedStores: {
          select: { storeId: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── User-Store Assignment ────────────────────────────────────────────────────

  async assignUserToStore(businessId: string, userId: string, storeId: string) {
    // Verify both user and store belong to this business
    const [user, store] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, businessId } }),
      this.prisma.store.findFirst({ where: { id: storeId, businessId } }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!store) throw new NotFoundException('Store not found');

    await this.prisma.userStore.upsert({
      where: { userId_storeId: { userId, storeId } },
      create: { userId, storeId, businessId },
      update: {},
    });
    return { message: 'Store assigned' };
  }

  async removeUserFromStore(businessId: string, userId: string, storeId: string) {
    await this.prisma.userStore.deleteMany({
      where: { userId, storeId, businessId },
    });
    return { message: 'Store assignment removed' };
  }

  async createUser(businessId: string, dto: CreateUserDto) {
    const USER_LIMITS: Record<string, number> = {
      FREE: 1, STARTER: 8, GROWTH: 15, PRO: 30, ENTERPRISE: Infinity,
    };

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { subscriptionTier: true, _count: { select: { users: true } } },
    });
    if (!business) throw new NotFoundException('Business not found');

    const limit = USER_LIMITS[business.subscriptionTier ?? 'FREE'] ?? 1;
    if (business._count.users >= limit) {
      throw new ForbiddenException(
        `User limit reached for ${business.subscriptionTier ?? 'FREE'} plan (max ${limit}). Upgrade your subscription to add more staff.`,
      );
    }

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email already in use');
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : null;
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : null;

    const user = await this.prisma.user.create({
      data: {
        businessId,
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        role: dto.role,
        passwordHash,
        pinHash,
      },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });

    return user;
  }

  async updateUser(businessId: string, userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, businessId },
    });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash =
      dto.password !== undefined
        ? dto.password
          ? await bcrypt.hash(dto.password, 12)
          : null
        : undefined;
    const pinHash =
      dto.pin !== undefined
        ? dto.pin
          ? await bcrypt.hash(dto.pin, 10)
          : null
        : undefined;

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(pinHash !== undefined && { pinHash }),
      },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
    });
  }

  async deleteUser(businessId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, businessId },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.OWNER) throw new BadRequestException('Cannot delete the owner');

    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'User deleted' };
  }

  // ─── Credential Management ────────────────────────────────────────────────────

  async saveEtimsCredentials(
    businessId: string,
    creds: { bhfId: string; tin: string; dvcSrno: string },
  ) {
    // Normalise into the shape the eTIMS service expects
    const normalised = {
      kraPin: creds.tin,
      branchId: creds.bhfId,
      dvcSrno: creds.dvcSrno,
    };
    const encrypted = this.encrypt(normalised);
    await this.prisma.business.update({
      where: { id: businessId },
      data: { etimsCredentialsEncrypted: encrypted },
    });
    return { message: 'eTIMS credentials saved' };
  }

  async saveMpesaCredentials(
    businessId: string,
    creds: {
      consumerKey: string;
      consumerSecret: string;
      shortcode: string;
      passkey: string;
      callbackUrl: string;
    },
  ) {
    const encrypted = this.encrypt(creds);
    await this.prisma.business.update({
      where: { id: businessId },
      data: { mpesaCredentialsEncrypted: encrypted },
    });
    return { message: 'M-Pesa credentials saved' };
  }

  async saveAtCredentials(
    businessId: string,
    creds: { apiKey: string; username: string; senderId?: string },
  ) {
    const encrypted = this.encrypt(creds);
    await this.prisma.business.update({
      where: { id: businessId },
      data: { atCredentialsEncrypted: encrypted },
    });
    return { message: 'Africa\'s Talking credentials saved' };
  }

  // ─── Exchange Rates ───────────────────────────────────────────────────────────

  async getExchangeRates(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { exchangeRates: true, displayCurrencies: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return {
      rates: business.exchangeRates ? JSON.parse(business.exchangeRates) : {},
      displayCurrencies: business.displayCurrencies
        ? JSON.parse(business.displayCurrencies)
        : [],
    };
  }

  /** Fetch live rates from open.er-api.com (KES base) and persist. */
  async refreshExchangeRates(businessId: string, currencies: string[]) {
    const resp = await fetch('https://open.er-api.com/v6/latest/KES');
    if (!resp.ok) throw new BadRequestException('Failed to fetch exchange rates');
    const data = (await resp.json()) as { result: string; rates: Record<string, number> };
    if (data.result !== 'success') throw new BadRequestException('Exchange rate API error');

    // open.er-api with base=KES: rates.USD = 0.00773 → invert → 1 USD = 129.4 KES
    const kesPerCurrency: Record<string, number> = {};
    for (const code of currencies) {
      const raw = data.rates[code];
      if (raw) kesPerCurrency[code] = Math.round((1 / raw) * 100) / 100;
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        exchangeRates: JSON.stringify(kesPerCurrency),
        displayCurrencies: JSON.stringify(currencies),
      },
    });
    return { rates: kesPerCurrency, displayCurrencies: currencies, refreshedAt: new Date() };
  }

  async updateExchangeRates(
    businessId: string,
    dto: { rates?: Record<string, number>; displayCurrencies?: string[] },
  ) {
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.rates !== undefined && { exchangeRates: JSON.stringify(dto.rates) }),
        ...(dto.displayCurrencies !== undefined && {
          displayCurrencies: JSON.stringify(dto.displayCurrencies),
        }),
      },
    });
    return { message: 'Exchange rates updated' };
  }

  // ─── Subscription ─────────────────────────────────────────────────────────────

  async cancelSubscription(businessId: string, reason: string) {
    const valid = ['PRICE', 'COMPETITOR', 'MISSING_FEATURE', 'POOR_SUPPORT', 'OTHER'];
    const cancelReason = valid.includes(reason) ? reason : 'OTHER';
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        subscriptionStatus: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason,
      },
      select: { id: true, subscriptionStatus: true, cancelReason: true, cancelledAt: true },
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

  // ── Pole Display Config (public) ──────────────────────────────────────────────

  async getPoleConfig(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, idleMessage: true, idleLogoUrl: true },
    });
    return business ?? { name: 'KASTRA POS', idleMessage: 'Welcome!', idleLogoUrl: null };
  }

  /** Resolve a shortCode (e.g. PREMIE01) or seed-style id (e.g. biz-001) to the real UUID + name */
  async resolveByCode(code: string) {
    const business = await this.prisma.business.findFirst({
      where: {
        OR: [
          { shortCode: code.toUpperCase() },
          { id: code }, // allow seed-style IDs like "biz-001"
        ],
      },
      select: { id: true, name: true, shortCode: true },
    });
    if (!business) return null;
    return business;
  }

  /** Public staff picker — returns only id/name/role for users who have a PIN set */
  async getStaffList(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId, pinHash: { not: null } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
