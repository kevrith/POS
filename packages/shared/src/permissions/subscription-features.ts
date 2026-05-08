// ============================================================
// Subscription Tier Feature Access Control
// ============================================================

export enum SubscriptionTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PRO = 'PRO',
  ENTERPRISE = 'ENTERPRISE',
}

export enum Feature {
  // Core POS
  POS = 'POS',
  CASH_DRAWER = 'CASH_DRAWER',
  CUSTOMERS = 'CUSTOMERS',
  
  // Inventory
  INVENTORY = 'INVENTORY',
  BATCH_TRACKING = 'BATCH_TRACKING',
  SERIAL_TRACKING = 'SERIAL_TRACKING',
  STOCKTAKE = 'STOCKTAKE',
  TRANSFERS = 'TRANSFERS',
  
  // Hospitality
  HOSPITALITY = 'HOSPITALITY',
  TABLE_MANAGEMENT = 'TABLE_MANAGEMENT',
  KDS = 'KDS',
  
  // Reports
  REPORTS_BASIC = 'REPORTS_BASIC',
  REPORTS_ADVANCED = 'REPORTS_ADVANCED',
  REPORTS_CUSTOM = 'REPORTS_CUSTOM',
  
  // Multi-store
  MULTI_STORE = 'MULTI_STORE',
  FRANCHISE = 'FRANCHISE',
  
  // Field Sales
  FIELD_SALES = 'FIELD_SALES',
  
  // Integrations
  INTEGRATIONS_BASIC = 'INTEGRATIONS_BASIC',
  INTEGRATIONS_ADVANCED = 'INTEGRATIONS_ADVANCED',
  API_KEYS = 'API_KEYS',
  WEBHOOKS = 'WEBHOOKS',
  
  // Loyalty & Marketing
  LOYALTY_BASIC = 'LOYALTY_BASIC',
  LOYALTY_ADVANCED = 'LOYALTY_ADVANCED',
  GIFT_CARDS = 'GIFT_CARDS',
  PROMOTIONS = 'PROMOTIONS',
  
  // HR & Payroll
  HR_BASIC = 'HR_BASIC',
  PAYROLL = 'PAYROLL',
  
  // Advanced
  OWNER_DASHBOARD = 'OWNER_DASHBOARD',
  AUDIT_LOGS = 'AUDIT_LOGS',
  CUSTOM_ROLES = 'CUSTOM_ROLES',
}

interface FeatureLimit {
  enabled: boolean;
  limit?: number; // undefined = unlimited
  description?: string;
}

type TierFeatures = Record<Feature, FeatureLimit>;

export const TIER_FEATURES: Record<SubscriptionTier, TierFeatures> = {
  [SubscriptionTier.FREE]: {
    [Feature.POS]: { enabled: true, limit: 200, description: '200 transactions/month' },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true, limit: 100 },
    [Feature.INVENTORY]: { enabled: true, limit: 50, description: '50 items max' },
    [Feature.BATCH_TRACKING]: { enabled: false },
    [Feature.SERIAL_TRACKING]: { enabled: false },
    [Feature.STOCKTAKE]: { enabled: false },
    [Feature.TRANSFERS]: { enabled: false },
    [Feature.HOSPITALITY]: { enabled: false },
    [Feature.TABLE_MANAGEMENT]: { enabled: false },
    [Feature.KDS]: { enabled: false },
    [Feature.REPORTS_BASIC]: { enabled: true },
    [Feature.REPORTS_ADVANCED]: { enabled: false },
    [Feature.REPORTS_CUSTOM]: { enabled: false },
    [Feature.MULTI_STORE]: { enabled: false },
    [Feature.FRANCHISE]: { enabled: false },
    [Feature.FIELD_SALES]: { enabled: false },
    [Feature.INTEGRATIONS_BASIC]: { enabled: false },
    [Feature.INTEGRATIONS_ADVANCED]: { enabled: false },
    [Feature.API_KEYS]: { enabled: false },
    [Feature.WEBHOOKS]: { enabled: false },
    [Feature.LOYALTY_BASIC]: { enabled: false },
    [Feature.LOYALTY_ADVANCED]: { enabled: false },
    [Feature.GIFT_CARDS]: { enabled: false },
    [Feature.PROMOTIONS]: { enabled: true, limit: 1 },
    [Feature.HR_BASIC]: { enabled: false },
    [Feature.PAYROLL]: { enabled: false },
    [Feature.OWNER_DASHBOARD]: { enabled: false },
    [Feature.AUDIT_LOGS]: { enabled: false },
    [Feature.CUSTOM_ROLES]: { enabled: false },
  },
  
  [SubscriptionTier.STARTER]: {
    [Feature.POS]: { enabled: true },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true, limit: 1000 },
    [Feature.INVENTORY]: { enabled: true, limit: 500 },
    [Feature.BATCH_TRACKING]: { enabled: true },
    [Feature.SERIAL_TRACKING]: { enabled: false },
    [Feature.STOCKTAKE]: { enabled: true },
    [Feature.TRANSFERS]: { enabled: false },
    [Feature.HOSPITALITY]: { enabled: true, limit: 20, description: '20 tables max' },
    [Feature.TABLE_MANAGEMENT]: { enabled: true },
    [Feature.KDS]: { enabled: true },
    [Feature.REPORTS_BASIC]: { enabled: true },
    [Feature.REPORTS_ADVANCED]: { enabled: true },
    [Feature.REPORTS_CUSTOM]: { enabled: false },
    [Feature.MULTI_STORE]: { enabled: false },
    [Feature.FRANCHISE]: { enabled: false },
    [Feature.FIELD_SALES]: { enabled: true, limit: 2, description: '2 agents max' },
    [Feature.INTEGRATIONS_BASIC]: { enabled: true },
    [Feature.INTEGRATIONS_ADVANCED]: { enabled: false },
    [Feature.API_KEYS]: { enabled: false },
    [Feature.WEBHOOKS]: { enabled: false },
    [Feature.LOYALTY_BASIC]: { enabled: true },
    [Feature.LOYALTY_ADVANCED]: { enabled: false },
    [Feature.GIFT_CARDS]: { enabled: true },
    [Feature.PROMOTIONS]: { enabled: true, limit: 10 },
    [Feature.HR_BASIC]: { enabled: true },
    [Feature.PAYROLL]: { enabled: false },
    [Feature.OWNER_DASHBOARD]: { enabled: false },
    [Feature.AUDIT_LOGS]: { enabled: true, limit: 90, description: '90 days retention' },
    [Feature.CUSTOM_ROLES]: { enabled: false },
  },
  
  [SubscriptionTier.PRO]: {
    [Feature.POS]: { enabled: true },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true },
    [Feature.INVENTORY]: { enabled: true },
    [Feature.BATCH_TRACKING]: { enabled: true },
    [Feature.SERIAL_TRACKING]: { enabled: true },
    [Feature.STOCKTAKE]: { enabled: true },
    [Feature.TRANSFERS]: { enabled: true },
    [Feature.HOSPITALITY]: { enabled: true },
    [Feature.TABLE_MANAGEMENT]: { enabled: true },
    [Feature.KDS]: { enabled: true },
    [Feature.REPORTS_BASIC]: { enabled: true },
    [Feature.REPORTS_ADVANCED]: { enabled: true },
    [Feature.REPORTS_CUSTOM]: { enabled: true },
    [Feature.MULTI_STORE]: { enabled: true, limit: 5 },
    [Feature.FRANCHISE]: { enabled: false },
    [Feature.FIELD_SALES]: { enabled: true, limit: 10 },
    [Feature.INTEGRATIONS_BASIC]: { enabled: true },
    [Feature.INTEGRATIONS_ADVANCED]: { enabled: true },
    [Feature.API_KEYS]: { enabled: true, limit: 5 },
    [Feature.WEBHOOKS]: { enabled: true },
    [Feature.LOYALTY_BASIC]: { enabled: true },
    [Feature.LOYALTY_ADVANCED]: { enabled: true },
    [Feature.GIFT_CARDS]: { enabled: true },
    [Feature.PROMOTIONS]: { enabled: true },
    [Feature.HR_BASIC]: { enabled: true },
    [Feature.PAYROLL]: { enabled: true },
    [Feature.OWNER_DASHBOARD]: { enabled: true },
    [Feature.AUDIT_LOGS]: { enabled: true, limit: 365 },
    [Feature.CUSTOM_ROLES]: { enabled: true },
  },
  
  [SubscriptionTier.ENTERPRISE]: {
    [Feature.POS]: { enabled: true },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true },
    [Feature.INVENTORY]: { enabled: true },
    [Feature.BATCH_TRACKING]: { enabled: true },
    [Feature.SERIAL_TRACKING]: { enabled: true },
    [Feature.STOCKTAKE]: { enabled: true },
    [Feature.TRANSFERS]: { enabled: true },
    [Feature.HOSPITALITY]: { enabled: true },
    [Feature.TABLE_MANAGEMENT]: { enabled: true },
    [Feature.KDS]: { enabled: true },
    [Feature.REPORTS_BASIC]: { enabled: true },
    [Feature.REPORTS_ADVANCED]: { enabled: true },
    [Feature.REPORTS_CUSTOM]: { enabled: true },
    [Feature.MULTI_STORE]: { enabled: true },
    [Feature.FRANCHISE]: { enabled: true },
    [Feature.FIELD_SALES]: { enabled: true },
    [Feature.INTEGRATIONS_BASIC]: { enabled: true },
    [Feature.INTEGRATIONS_ADVANCED]: { enabled: true },
    [Feature.API_KEYS]: { enabled: true },
    [Feature.WEBHOOKS]: { enabled: true },
    [Feature.LOYALTY_BASIC]: { enabled: true },
    [Feature.LOYALTY_ADVANCED]: { enabled: true },
    [Feature.GIFT_CARDS]: { enabled: true },
    [Feature.PROMOTIONS]: { enabled: true },
    [Feature.HR_BASIC]: { enabled: true },
    [Feature.PAYROLL]: { enabled: true },
    [Feature.OWNER_DASHBOARD]: { enabled: true },
    [Feature.AUDIT_LOGS]: { enabled: true },
    [Feature.CUSTOM_ROLES]: { enabled: true },
  },
};

export function hasFeatureAccess(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier]?.[feature]?.enabled ?? false;
}

export function getFeatureLimit(tier: SubscriptionTier, feature: Feature): number | undefined {
  return TIER_FEATURES[tier]?.[feature]?.limit;
}

export function getFeatureDescription(tier: SubscriptionTier, feature: Feature): string | undefined {
  return TIER_FEATURES[tier]?.[feature]?.description;
}

export function getRequiredTierForFeature(feature: Feature): SubscriptionTier | null {
  const tiers = [SubscriptionTier.FREE, SubscriptionTier.STARTER, SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE];
  for (const tier of tiers) {
    if (hasFeatureAccess(tier, feature)) {
      return tier;
    }
  }
  return null;
}
