import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { Feature, hasFeatureAccess, getFeatureLimit, SubscriptionTier, effectiveTier, isActiveTrial } from '@pos/shared';

export const REQUIRES_FEATURE = 'requires_feature';
export const SKIP_SUBSCRIPTION_CHECK = 'skip_subscription_check';

/**
 * Decorator to mark routes that require specific subscription features
 * Usage: @RequiresFeature(Feature.HOSPITALITY)
 */
export const RequiresFeature = (feature: Feature) => {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // Method-level: gate this one route.
      Reflect.defineMetadata(REQUIRES_FEATURE, feature, descriptor.value);
      return descriptor;
    }
    // Class-level: gate every route on the controller. Applying this per route
    // meant 774 endpoints needed 774 decorators, so in practice only two ever got
    // one and the tiers were enforced in the UI alone.
    Reflect.defineMetadata(REQUIRES_FEATURE, feature, target);
    return target;
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
    const skipCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_SUBSCRIPTION_CHECK,
      [context.getHandler(), context.getClass()],
    );

    if (skipCheck) {
      return true;
    }

    // Route first, then the controller it lives on — a method-level gate on a
    // gated controller narrows it further rather than being ignored.
    const requiredFeature = this.reflector.getAllAndOverride<Feature>(
      REQUIRES_FEATURE,
      [context.getHandler(), context.getClass()],
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
     * One shared decision, used by the web app's useFeatureAccess too.
     *
     * This was worked out here and again on the client, and the two disagreed:
     * the client granted a trial everything, while this granted only what the
     * stored tier allowed — and that tier defaulted to the string "TRIAL", which
     * is a status, not a tier, and resolved to FREE. Trial customers therefore
     * got a full sidebar beside tiles telling them to upgrade.
     *
     * It also closes a revenue leak. This used to treat a lapsed trial as expired
     * only while its status still read TRIAL, so TrialExpiryService flipping the
     * status to EXPIRED defeated the very check meant to catch it, and the
     * business kept its provisioned tier for good without ever paying.
     * effectiveTier grants the top tier while trialEndsAt is in the future and
     * FREE for any trial or expired subscription after it.
     */
    const tier = effectiveTier(business);
    const trialExpired =
      !isActiveTrial(business) &&
      (business.subscriptionStatus === 'TRIAL' || business.subscriptionStatus === 'EXPIRED') &&
      !!business.trialEndsAt;

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
