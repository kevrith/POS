import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { UserRole } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload } from './auth.service';

/** How long a phone stays enrolled without being used. Every sign-in pushes it out again. */
export const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_USER = 5;
const DEVICE_MARK = 'device:';

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/**
 * "Unlock with fingerprint" for the native apps.
 *
 * A phone cannot keep a JWT for this: they last 15 minutes to 12 hours. It also must not keep a password or PIN.
 * Instead, after a normal sign-in the app asks for a device token: a random secret that is stored hashed in
 * UserSession, can be revoked, and expires after 90 days unused. The app keeps it in the secure keystore and
 * only releases it after the phone's own fingerprint / face check, then trades it here for a normal session.
 * The server never sees the biometric; the fingerprint only decides whether the app may use the token.
 */
@Injectable()
export class DeviceLoginService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /** Enrol this phone for the signed-in user. Returns the token to store in the secure keystore. */
  async enrol(userId: string, deviceName?: string): Promise<{ deviceToken: string; expiresAt: Date }> {
    const secret = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + DEVICE_TOKEN_TTL_MS);
    const label = (deviceName ?? 'Phone').slice(0, 80);

    const session = await this.prisma.userSession.create({
      data: { userId, tokenHash: sha256(secret), userAgent: `${DEVICE_MARK}${label}`, expiresAt },
    });

    // Keep only the newest few enrolments so a lost phone's token cannot pile up unnoticed.
    const live = await this.prisma.userSession.findMany({
      where: { userId, isRevoked: false, userAgent: { startsWith: DEVICE_MARK } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const surplus = live.slice(MAX_DEVICES_PER_USER).map((s) => s.id);
    if (surplus.length) {
      await this.prisma.userSession.updateMany({ where: { id: { in: surplus } }, data: { isRevoked: true } });
    }

    return { deviceToken: `${session.id}.${secret}`, expiresAt };
  }

  /** Trade a device token for a normal session, the same shape PIN login returns. */
  async login(deviceToken: string): Promise<{ accessToken: string; user: AuthUser }> {
    const invalid = () => new UnauthorizedException('Fingerprint sign-in has expired. Sign in with your PIN or password.');
    if (typeof deviceToken !== 'string') throw invalid();
    const [id, secret] = deviceToken.split('.');
    if (!id || !secret) throw invalid();

    const session = await this.prisma.userSession.findUnique({
      where: { id },
      include: { user: { include: { assignedStores: { select: { storeId: true } } } } },
    });
    if (
      !session ||
      session.isRevoked ||
      session.expiresAt < new Date() ||
      !session.userAgent?.startsWith(DEVICE_MARK) ||
      !crypto.timingSafeEqual(Buffer.from(sha256(secret)), Buffer.from(session.tokenHash))
    ) {
      throw invalid();
    }

    const user = session.user;
    const biz = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { planName: true, subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true },
    });
    const storeId = user.assignedStores[0]?.storeId;
    const assignedStoreIds =
      user.role === UserRole.MANAGER && user.assignedStores.length > 0
        ? user.assignedStores.map((s) => s.storeId)
        : undefined;

    const planName = biz?.planName ?? 'STARTER';
    const subscriptionTier = biz?.subscriptionTier ?? 'FREE';
    const payload: JwtPayload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role as UserRole,
      storeId,
      ...(assignedStoreIds && { assignedStoreIds }),
      planName,
      subscriptionTier,
      subscriptionStatus: biz?.subscriptionStatus,
      trialEndsAt: biz?.trialEndsAt ?? null,
    };

    await this.prisma.userSession.update({
      where: { id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL_MS) },
    });

    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '12h' }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as UserRole,
        businessId: user.businessId,
        storeId,
        ...(assignedStoreIds && { assignedStoreIds }),
        planName,
        subscriptionTier,
        subscriptionStatus: biz?.subscriptionStatus,
        trialEndsAt: biz?.trialEndsAt ?? null,
      },
    };
  }

  /** Turn fingerprint sign-in off: revoke this phone's token, or every phone of the user when none is given. */
  async revoke(userId: string, deviceToken?: string): Promise<{ ok: true }> {
    const id = deviceToken?.split('.')[0];
    await this.prisma.userSession.updateMany({
      where: { userId, userAgent: { startsWith: DEVICE_MARK }, ...(id ? { id } : {}) },
      data: { isRevoked: true },
    });
    return { ok: true };
  }
}
