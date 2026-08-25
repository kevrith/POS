import { useMemo } from 'react';
import { useAuthStore } from '../stores/auth';
import { Feature, hasFeatureAccess, getFeatureLimit, SubscriptionTier, effectiveTier } from '@pos/shared';

interface FeatureAccess {
  hasAccess: boolean;
  limit?: number;
  currentTier: SubscriptionTier;
  requiredTier?: SubscriptionTier;
}

export function useFeatureAccess(feature: Feature): FeatureAccess {
  const user = useAuthStore((s) => s.user);
  
  return useMemo(() => {
    // effectiveTier is the same function SubscriptionGuard uses on the API, so the
    // greyed-out tiles and the 403 always agree. Deciding it here independently is
    // what left trial customers with a full sidebar and tiles telling them to
    // upgrade: a trial grants the top tier until trialEndsAt, then drops to FREE.
    //
    // planName remains a last-resort fallback for tokens issued before the tier
    // was carried; it is a display label and must never be the primary input.
    const tier = effectiveTier({
      subscriptionTier: user?.subscriptionTier ?? user?.planName,
      subscriptionStatus: user?.subscriptionStatus,
      trialEndsAt: user?.trialEndsAt,
    });
    const hasAccess = hasFeatureAccess(tier, feature);
    const limit = getFeatureLimit(tier, feature);
    
    // Find the minimum tier that grants access
    let requiredTier: SubscriptionTier | undefined;
    if (!hasAccess) {
      const tiers = [SubscriptionTier.STARTER, SubscriptionTier.GROWTH, SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE];
      for (const t of tiers) {
        if (hasFeatureAccess(t, feature)) {
          requiredTier = t;
          break;
        }
      }
    }
    
    return {
      hasAccess,
      limit,
      currentTier: tier,
      requiredTier,
    };
  }, [user?.subscriptionTier, user?.planName, user?.subscriptionStatus, user?.trialEndsAt, feature]);
}
