import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Feature, hasFeatureAccess, getFeatureLimit, SubscriptionTier } from '@pos/shared';

export const REQUIRES_FEATURE = 'requires_feature';
export const SKIP_SUBSCRIPTION_CHECK = 'skip_subscription_check';

/**
 * Decorator to mark routes that require specific subscription features
 * Usage: @RequiresFeature(Feature.HOSPITALITY)
 */
export const RequiresFeature = (feature: Feature) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(REQUIRES_FEATURE, feature, descriptor.value);
    }
    return descriptor;
  };
};

/**
 * Decorator to skip subscription checks for public/auth routes
 * Usage: @SkipSubscriptionCheck()
 */
export const SkipSubscriptionCheck = () => SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked to skip subscription check
    const skipCheck = this.reflector.get<boolean>(
      SKIP_SUBSCRIPTION_CHECK,
      context.getHandler(),
    );

    if (skipCheck) {
      return true;
    }

    const requiredFeature = this.reflector.get<Feature>(
      REQUIRES_FEATURE,
      context.getHandler(),
    );

    if (!requiredFeature) {
      // No feature requirement, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.businessId) {
      throw new ForbiddenException('Business context required');
    }

    // Fetch business subscription tier
    const business = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: {
        subscriptionTier: true,
        planName: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });

    if (!business) {
      throw new ForbiddenException('Business not found');
    }

    /**
     * A finished trial has to actually end.
     *
     * Nothing flips subscriptionStatus away from TRIAL — there is no scheduled job
     * — and this guard only ever read the tier, so a trial provisioned on ENTERPRISE
     * kept every paid feature indefinitely. Expiry is evaluated on each request
     * instead: past trialEndsAt with no payment, the business is treated as FREE.
     */
    const trialExpired =
      business.subscriptionStatus === 'TRIAL' &&
      !!business.trialEndsAt &&
      new Date() > business.trialEndsAt;

    const tier = (
      trialExpired ? 'FREE' : business.subscriptionTier ?? 'FREE'
    ) as SubscriptionTier;

    // Check if tier has access to the feature
    if (!hasFeatureAccess(tier, requiredFeature)) {
      const requiredTiers = this.getRequiredTiers(requiredFeature);
      throw new ForbiddenException(
        trialExpired
          ? `Your free trial has ended. Subscribe to keep using this feature — /settings/subscription`
          : `This feature requires ${requiredTiers.join(' or ')} plan. You are currently on ${tier}. Please upgrade at /settings/subscription`,
      );
    }

    return true;
  }

  private getRequiredTiers(feature: Feature): string[] {
    const tiers = [
      SubscriptionTier.STARTER,
      SubscriptionTier.GROWTH,
      SubscriptionTier.PRO,
      SubscriptionTier.ENTERPRISE,
    ];

    return tiers.filter((tier) => hasFeatureAccess(tier, feature));
  }
}
