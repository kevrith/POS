// ============================================================
// Subscription Tier Feature Access Control
// ============================================================

export enum SubscriptionTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  GROWTH = 'GROWTH',
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

  // Vertical and finance modules. Tiers mirror FEATURE_PLANS in the web app, which
  // is what the UI already gates on — the API simply had no equivalent.
  PHARMACY = 'PHARMACY',
  PRESCRIPTIONS = 'PRESCRIPTIONS',
  FUEL_PUMP = 'FUEL_PUMP',
  CYBERCAFE = 'CYBERCAFE',
  APPOINTMENTS = 'APPOINTMENTS',
  WAITLIST = 'WAITLIST',
  RECIPES = 'RECIPES',
  BUNDLES = 'BUNDLES',
  SUPPLIERS = 'SUPPLIERS',
  RFQ = 'RFQ',
  DAMAGED_GOODS = 'DAMAGED_GOODS',
  LAYAWAY = 'LAYAWAY',
  EXPENSES = 'EXPENSES',
  CHEQUES = 'CHEQUES',
  LEDGER = 'LEDGER',
  PAYMENT_LINKS = 'PAYMENT_LINKS',
  SECURITY_SETTINGS = 'SECURITY_SETTINGS',
  SCHEDULED_REPORTS = 'SCHEDULED_REPORTS',
  HOTEL = 'HOTEL',
  CHANNEL_MANAGER = 'CHANNEL_MANAGER',
  FORECASTING = 'FORECASTING',
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
    [Feature.CUSTOMERS]: { enabled: true },
    [Feature.INVENTORY]: { enabled: true },
    [Feature.BATCH_TRACKING]: { enabled: false },
    [Feature.SERIAL_TRACKING]: { enabled: false },
    [Feature.STOCKTAKE]: { enabled: false },
    [Feature.TRANSFERS]: { enabled: false },
    [Feature.HOSPITALITY]: { enabled: false },
    [Feature.TABLE_MANAGEMENT]: { enabled: false },
    [Feature.KDS]: { enabled: false },
    [Feature.REPORTS_BASIC]: { enabled: false },
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
    [Feature.PROMOTIONS]: { enabled: false },
    [Feature.HR_BASIC]: { enabled: false },
    [Feature.PAYROLL]: { enabled: false },
    [Feature.OWNER_DASHBOARD]: { enabled: false },
    [Feature.AUDIT_LOGS]: { enabled: false },
    [Feature.CUSTOM_ROLES]: { enabled: false },
    [Feature.PHARMACY]: { enabled: false },
    [Feature.PRESCRIPTIONS]: { enabled: false },
    [Feature.FUEL_PUMP]: { enabled: false },
    [Feature.CYBERCAFE]: { enabled: false },
    [Feature.APPOINTMENTS]: { enabled: false },
    [Feature.WAITLIST]: { enabled: false },
    [Feature.RECIPES]: { enabled: false },
    [Feature.BUNDLES]: { enabled: false },
    [Feature.SUPPLIERS]: { enabled: false },
    [Feature.RFQ]: { enabled: false },
    [Feature.DAMAGED_GOODS]: { enabled: false },
    [Feature.LAYAWAY]: { enabled: false },
    [Feature.EXPENSES]: { enabled: false },
    [Feature.CHEQUES]: { enabled: false },
    [Feature.LEDGER]: { enabled: false },
    [Feature.PAYMENT_LINKS]: { enabled: false },
    [Feature.SECURITY_SETTINGS]: { enabled: false },
    [Feature.SCHEDULED_REPORTS]: { enabled: false },
    [Feature.HOTEL]: { enabled: false },
    [Feature.CHANNEL_MANAGER]: { enabled: false },
    [Feature.FORECASTING]: { enabled: false },
  },
  
  [SubscriptionTier.STARTER]: {
    [Feature.POS]: { enabled: true },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true },
    [Feature.INVENTORY]: { enabled: true },
    [Feature.BATCH_TRACKING]: { enabled: true },
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
    [Feature.PROMOTIONS]: { enabled: false },
    [Feature.HR_BASIC]: { enabled: false },
    [Feature.PAYROLL]: { enabled: false },
    [Feature.OWNER_DASHBOARD]: { enabled: false },
    [Feature.AUDIT_LOGS]: { enabled: false },
    [Feature.CUSTOM_ROLES]: { enabled: false },
    [Feature.PHARMACY]: { enabled: false },
    [Feature.PRESCRIPTIONS]: { enabled: false },
    [Feature.FUEL_PUMP]: { enabled: false },
    [Feature.CYBERCAFE]: { enabled: false },
    [Feature.APPOINTMENTS]: { enabled: false },
    [Feature.WAITLIST]: { enabled: false },
    [Feature.RECIPES]: { enabled: false },
    [Feature.BUNDLES]: { enabled: false },
    [Feature.SUPPLIERS]: { enabled: false },
    [Feature.RFQ]: { enabled: false },
    [Feature.DAMAGED_GOODS]: { enabled: false },
    [Feature.LAYAWAY]: { enabled: false },
    [Feature.EXPENSES]: { enabled: false },
    [Feature.CHEQUES]: { enabled: false },
    [Feature.LEDGER]: { enabled: false },
    [Feature.PAYMENT_LINKS]: { enabled: false },
    [Feature.SECURITY_SETTINGS]: { enabled: false },
    [Feature.SCHEDULED_REPORTS]: { enabled: false },
    [Feature.HOTEL]: { enabled: false },
    [Feature.CHANNEL_MANAGER]: { enabled: false },
    [Feature.FORECASTING]: { enabled: false },
  },
  
  [SubscriptionTier.GROWTH]: {
    [Feature.POS]: { enabled: true },
    [Feature.CASH_DRAWER]: { enabled: true },
    [Feature.CUSTOMERS]: { enabled: true },
    [Feature.INVENTORY]: { enabled: true },
    [Feature.BATCH_TRACKING]: { enabled: true },
    [Feature.SERIAL_TRACKING]: { enabled: true },
    [Feature.STOCKTAKE]: { enabled: true },
    [Feature.TRANSFERS]: { enabled: false },
    [Feature.HOSPITALITY]: { enabled: true },
    [Feature.TABLE_MANAGEMENT]: { enabled: true },
    [Feature.KDS]: { enabled: true },
    [Feature.REPORTS_BASIC]: { enabled: true },
    [Feature.REPORTS_ADVANCED]: { enabled: true },
    [Feature.REPORTS_CUSTOM]: { enabled: false },
    [Feature.MULTI_STORE]: { enabled: true, limit: 2 },
    [Feature.FRANCHISE]: { enabled: false },
    [Feature.FIELD_SALES]: { enabled: false },
    [Feature.INTEGRATIONS_BASIC]: { enabled: true },
    [Feature.INTEGRATIONS_ADVANCED]: { enabled: false },
    [Feature.API_KEYS]: { enabled: false },
    [Feature.WEBHOOKS]: { enabled: false },
    [Feature.LOYALTY_BASIC]: { enabled: true },
    [Feature.LOYALTY_ADVANCED]: { enabled: true },
    [Feature.GIFT_CARDS]: { enabled: true },
    [Feature.PROMOTIONS]: { enabled: true },
    [Feature.HR_BASIC]: { enabled: false },
    [Feature.PAYROLL]: { enabled: false },
    [Feature.OWNER_DASHBOARD]: { enabled: false },
    [Feature.AUDIT_LOGS]: { enabled: true },
    [Feature.CUSTOM_ROLES]: { enabled: false },
    [Feature.PHARMACY]: { enabled: true },
    [Feature.PRESCRIPTIONS]: { enabled: true },
    [Feature.FUEL_PUMP]: { enabled: true },
    [Feature.CYBERCAFE]: { enabled: true },
    [Feature.APPOINTMENTS]: { enabled: true },
    [Feature.WAITLIST]: { enabled: true },
    [Feature.RECIPES]: { enabled: true },
    [Feature.BUNDLES]: { enabled: true },
    [Feature.SUPPLIERS]: { enabled: true },
    [Feature.RFQ]: { enabled: true },
    [Feature.DAMAGED_GOODS]: { enabled: true },
    [Feature.LAYAWAY]: { enabled: true },
    [Feature.EXPENSES]: { enabled: false },
    [Feature.CHEQUES]: { enabled: false },
    [Feature.LEDGER]: { enabled: false },
    [Feature.PAYMENT_LINKS]: { enabled: false },
    [Feature.SECURITY_SETTINGS]: { enabled: false },
    [Feature.SCHEDULED_REPORTS]: { enabled: false },
    [Feature.HOTEL]: { enabled: false },
    [Feature.CHANNEL_MANAGER]: { enabled: false },
    [Feature.FORECASTING]: { enabled: false },
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
    [Feature.FIELD_SALES]: { enabled: false },
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
    [Feature.CUSTOM_ROLES]: { enabled: false },
    [Feature.PHARMACY]: { enabled: true },
    [Feature.PRESCRIPTIONS]: { enabled: true },
    [Feature.FUEL_PUMP]: { enabled: true },
    [Feature.CYBERCAFE]: { enabled: true },
    [Feature.APPOINTMENTS]: { enabled: true },
    [Feature.WAITLIST]: { enabled: true },
    [Feature.RECIPES]: { enabled: true },
    [Feature.BUNDLES]: { enabled: true },
    [Feature.SUPPLIERS]: { enabled: true },
    [Feature.RFQ]: { enabled: true },
    [Feature.DAMAGED_GOODS]: { enabled: true },
    [Feature.LAYAWAY]: { enabled: true },
    [Feature.EXPENSES]: { enabled: true },
    [Feature.CHEQUES]: { enabled: true },
    [Feature.LEDGER]: { enabled: true },
    [Feature.PAYMENT_LINKS]: { enabled: true },
    [Feature.SECURITY_SETTINGS]: { enabled: true },
    [Feature.SCHEDULED_REPORTS]: { enabled: true },
    [Feature.HOTEL]: { enabled: false },
    [Feature.CHANNEL_MANAGER]: { enabled: false },
    [Feature.FORECASTING]: { enabled: false },
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
    [Feature.PHARMACY]: { enabled: true },
    [Feature.PRESCRIPTIONS]: { enabled: true },
    [Feature.FUEL_PUMP]: { enabled: true },
    [Feature.CYBERCAFE]: { enabled: true },
    [Feature.APPOINTMENTS]: { enabled: true },
    [Feature.WAITLIST]: { enabled: true },
    [Feature.RECIPES]: { enabled: true },
    [Feature.BUNDLES]: { enabled: true },
    [Feature.SUPPLIERS]: { enabled: true },
    [Feature.RFQ]: { enabled: true },
    [Feature.DAMAGED_GOODS]: { enabled: true },
    [Feature.LAYAWAY]: { enabled: true },
    [Feature.EXPENSES]: { enabled: true },
    [Feature.CHEQUES]: { enabled: true },
    [Feature.LEDGER]: { enabled: true },
    [Feature.PAYMENT_LINKS]: { enabled: true },
    [Feature.SECURITY_SETTINGS]: { enabled: true },
    [Feature.SCHEDULED_REPORTS]: { enabled: true },
    [Feature.HOTEL]: { enabled: true },
    [Feature.CHANNEL_MANAGER]: { enabled: true },
    [Feature.FORECASTING]: { enabled: true },
  },
};

/**
 * Resolve whatever the caller passed to a tier key.
 *
 * These lookups used the value verbatim, so anything that was not already an exact
 * upper-case match — "Enterprise" as written by a paid activation, a stale planName,
 * a stray space — missed the table and fell through to `?? false`, silently locking
 * every feature for a customer who had paid for them.
 */
function tierKey(tier: SubscriptionTier | string | undefined | null): SubscriptionTier {
  const key = String(tier ?? '').trim().toUpperCase() as SubscriptionTier;
  return TIER_FEATURES[key] ? key : (SubscriptionTier.FREE);
}

export function hasFeatureAccess(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tierKey(tier)]?.[feature]?.enabled ?? false;
}

export function getFeatureLimit(tier: SubscriptionTier, feature: Feature): number | undefined {
  return TIER_FEATURES[tierKey(tier)]?.[feature]?.limit;
}

export function getFeatureDescription(tier: SubscriptionTier, feature: Feature): string | undefined {
  return TIER_FEATURES[tierKey(tier)]?.[feature]?.description;
}

export function getRequiredTierForFeature(feature: Feature): SubscriptionTier | null {
  const tiers = [SubscriptionTier.FREE, SubscriptionTier.STARTER, SubscriptionTier.GROWTH, SubscriptionTier.PRO, SubscriptionTier.ENTERPRISE];
  for (const tier of tiers) {
    if (hasFeatureAccess(tier, feature)) {
      return tier;
    }
  }
  return null;
}
