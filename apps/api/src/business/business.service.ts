import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { createCipheriv, randomBytes } from 'crypto';
import { UserRole } from '@pos/shared';

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

interface CreateUserDto {
  name: string;
  email?: string;
  role: UserRole;
  pin?: string;
  password?: string;
}

interface UpdateUserDto {
  name?: string;
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
        // Never return passwordHash, pinHash, or totpSecret
      },
      orderBy: { name: 'asc' },
    });
  }

  async createUser(businessId: string, dto: CreateUserDto) {
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
        role: dto.role,
        passwordHash,
        pinHash,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
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
        ...(dto.role !== undefined && { role: dto.role }),
        ...(passwordHash !== undefined && { passwordHash }),
        ...(pinHash !== undefined && { pinHash }),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
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
    creds: { bhfId: string; tin: string; cmcKey: string },
  ) {
    const encrypted = this.encrypt(creds);
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

  // ─── Subscription ─────────────────────────────────────────────────────────────

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
