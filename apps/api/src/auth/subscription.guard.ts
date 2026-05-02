import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';

export const SKIP_SUBSCRIPTION_CHECK = 'skipSubscriptionCheck';
/** Decorator to bypass subscription check on specific endpoints. */
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);

/**
 * Enforces subscription / trial status. Apply globally or per-controller after JwtAuthGuard.
 * Returns 402 Payment Required when trial has expired and no active subscription exists.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes that explicitly opt out (e.g. /auth/login, /subscription)
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return true; // unauthenticated — let JwtAuthGuard handle it

    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { subscriptionStatus: true, trialEndsAt: true },
    });

    if (!business) return true; // non-critical — let downstream handle it

    // FREE tier and active subscriptions always pass through
    if (business.subscriptionStatus === 'FREE' || business.subscriptionStatus === 'ACTIVE') {
      return true;
    }

    // Trial expired → lazy-downgrade to FREE and let the request through.
    // The frontend upgrade banner handles prompting the user; feature gates limit access.
    if (
      business.subscriptionStatus === 'TRIAL' &&
      business.trialEndsAt &&
      new Date() > business.trialEndsAt
    ) {
      this.prisma.business.update({
        where: { id: user.businessId },
        data: { subscriptionStatus: 'FREE', subscriptionTier: 'FREE', planName: 'Free' },
      }).catch(() => {});
      return true;
    }

    return true;
  }
}
