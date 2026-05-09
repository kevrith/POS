import { useMemo } from 'react';
import { useAuthStore } from '../stores/auth';
import { Feature, hasFeatureAccess, getFeatureLimit, SubscriptionTier } from '@pos/shared';

interface FeatureAccess {
  hasAccess: boolean;
  limit?: number;
  currentTier: SubscriptionTier;
  requiredTier?: SubscriptionTier;
}

export function useFeatureAccess(feature: Feature): FeatureAccess {
  const user = useAuthStore((s) => s.user);
  
  return useMemo(() => {
    const tier = (user?.planName ?? 'FREE') as SubscriptionTier;
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
  }, [user?.planName, feature]);
}
