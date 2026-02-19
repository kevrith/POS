import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { UserRole } from '@pos/shared';

export interface JwtPayload {
  sub: string;       // userId
  businessId: string;
  role: UserRole;
  storeId?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  businessId: string;
  storeId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // ─── Email + Password login ──────────────────────────────────
  async loginWithPassword(
    email: string,
    password: string,
    totpCode?: string,
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash ?? ''))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Owner/Admin: TOTP mandatory
    if (
      (user.role === UserRole.OWNER || user.role === UserRole.MANAGER) &&
      user.totpSecret
    ) {
      if (!totpCode) {
        throw new UnauthorizedException('TOTP code required');
      }
      const valid = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: 'base32',
        token: totpCode,
        window: 1,
      });
      if (!valid) throw new UnauthorizedException('Invalid TOTP code');
    }

    const payload: JwtPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role as UserRole,
    };

    const accessToken = this.jwt.sign(payload, { expiresIn: '15m' });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        businessId: user.businessId,
      },
    };
  }

  // ─── PIN login (Cashier / Waiter / Kitchen) ──────────────────
  async loginWithPin(
    pin: string,
    businessId: string,
    storeId?: string,
  ): Promise<{ accessToken: string; user: AuthUser }> {
    const pinHash = await bcrypt.hash(pin, 10);
    const users = await this.prisma.user.findMany({
      where: { businessId, pinHash: { not: null } },
    });

    let matchedUser: (typeof users)[0] | undefined;
    for (const u of users) {
      if (u.pinHash && (await bcrypt.compare(pin, u.pinHash))) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) throw new UnauthorizedException('Invalid PIN');

    const payload: JwtPayload = {
      sub: matchedUser.id,
      businessId: matchedUser.businessId,
      role: matchedUser.role as UserRole,
      storeId,
    };

    const accessToken = this.jwt.sign(payload, { expiresIn: '12h' });

    return {
      accessToken,
      user: {
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role as UserRole,
        businessId: matchedUser.businessId,
        storeId,
      },
    };
  }

  // ─── Refresh token ───────────────────────────────────────────
  async refreshToken(
    userId: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const payload: JwtPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role as UserRole,
    };

    return { accessToken: this.jwt.sign(payload, { expiresIn: '15m' }) };
  }

  // ─── TOTP setup ──────────────────────────────────────────────
  async setupTotp(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = speakeasy.generateSecret({ name: `POS Kenya (${user.email ?? user.name})` });

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret.base32 },
    });

    return { secret: secret.base32, otpauthUrl: secret.otpauth_url ?? '' };
  }

  // ─── Register owner ──────────────────────────────────────────
  async registerOwner(data: {
    name: string;
    email: string;
    password: string;
    businessName: string;
  }): Promise<{ accessToken: string; user: AuthUser }> {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new BadRequestException('Email already registered');

    const passwordHash = await bcrypt.hash(data.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: data.businessName,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14-day trial
        },
      });

      const store = await tx.store.create({
        data: {
          businessId: business.id,
          name: `${data.businessName} - Main`,
          storeCode: 'NRB01',
        },
      });

      const user = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          role: UserRole.OWNER,
          businessId: business.id,
        },
      });

      return { business, store, user };
    });

    const payload: JwtPayload = {
      sub: result.user.id,
      businessId: result.user.businessId,
      role: UserRole.OWNER,
    };

    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '15m' }),
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: UserRole.OWNER,
        businessId: result.user.businessId,
      },
    };
  }

  async validateUser(payload: JwtPayload): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRole,
      businessId: user.businessId,
    };
  }

  // ─── Verify Manager PIN (for voids) ──────────────────────────
  async verifyManagerPin(
    pin: string,
    businessId: string,
  ): Promise<{ userId: string; name: string }> {
    const users = await this.prisma.user.findMany({
      where: {
        businessId,
        role: { in: [UserRole.OWNER, UserRole.MANAGER] },
        pinHash: { not: null },
      },
    });

    for (const user of users) {
      if (user.pinHash && (await bcrypt.compare(pin, user.pinHash))) {
        return { userId: user.id, name: user.name };
      }
    }

    throw new UnauthorizedException('Invalid manager PIN');
  }
}
