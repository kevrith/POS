/**
 * Feature gate definitions — maps each route/feature key to the minimum plan required.
 * Use hasFeature() in Layout nav filtering and any page-level gate.
 *
 * Plan hierarchy:  FREE  <  STARTER  <  GROWTH  <  PRO  <  ENTERPRISE
 */

export type Plan = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';

export const PLAN_RANK: Record<Plan, number> = {
  FREE:       0,
  STARTER:    1,
  GROWTH:     2,
  PRO:        3,
  ENTERPRISE: 4,
};

export const PLAN_LABELS: Record<Plan, string> = {
  FREE:       'Free',
  STARTER:    'Starter',
  GROWTH:     'Growth',
  PRO:        'Pro',
  ENTERPRISE: 'Enterprise',
};

export const PLAN_PRICES_KES: Record<Plan, number> = {
  FREE:       0,
  STARTER:    999,
  GROWTH:     2499,
  PRO:        4999,
  ENTERPRISE: 14999,
};

export const PLAN_LIMITS: Record<Plan, { stores: number; users: number }> = {
  FREE:       { stores: 1, users: 1 },
  STARTER:    { stores: 1, users: 8 },
  GROWTH:     { stores: 2, users: 15 },
  PRO:        { stores: 5, users: 30 },
  ENTERPRISE: { stores: Infinity, users: Infinity },
};

/**
 * Maps route segment → minimum plan.
 * Keys are the nav item's `to` path with the leading '/' stripped.
 * Unlisted keys default to FREE (always accessible).
 */
export const FEATURE_PLANS: Record<string, Plan> = {
  // ── FREE ─────────────────────────────────────────────────────────────────
  'dashboard':    'FREE',
  'pos':          'FREE',
  'inventory':    'FREE',
  'customers':    'FREE',
  'sales-list':   'FREE',
  'cash-drawer':  'FREE',

  // Fingerprint / Face ID sign-in on the website and desktop app: registering a device in Settings > Users.
  // (Not a route: the key is checked by SettingsPage. A trial gets every feature, like everything else here.)
  'biometric':    'PRO',

  // ── STARTER (KES 999/mo) ─────────────────────────────────────────────────
  'batch':                  'STARTER',
  'reports':                'STARTER',
  'settings':               'STARTER',
  'receipt-customization':  'STARTER',

  // ── GROWTH (KES 2,499/mo) ────────────────────────────────────────────────
  'hospitality':          'GROWTH',
  'kds':                  'GROWTH',
  'layaway':              'GROWTH',
  'proforma':             'GROWTH',
  'prescriptions':        'GROWTH',
  'patients':             'GROWTH',
  'visits':               'GROWTH',
  'claims':               'GROWTH',
  'lab':                  'GROWTH',
  'clinic-reports':       'GROWTH',
  'compliance':           'GROWTH',
  'pharmacy':             'GROWTH',
  'appointments':         'GROWTH',
  'delivery':             'GROWTH',
  'delivery-management':  'GROWTH',
  'waitlist':             'GROWTH',
  'fuel-pump':            'GROWTH',
  'cybercafe':            'GROWTH',
  'serial':               'GROWTH',
  'recipe':               'GROWTH',
  'bundle':               'GROWTH',
  'suppliers':            'GROWTH',
  'rfq':                  'GROWTH',
  'stocktake':            'GROWTH',
  'damaged-goods':        'GROWTH',
  'promotions':           'GROWTH',
  'gift-cards':           'GROWTH',

  // ── PRO (KES 4,999/mo) ───────────────────────────────────────────────────
  'transfers':            'PRO',
  'owner-dashboard':      'PRO',
  'expenses':             'PRO',
  'cheques':              'PRO',
  'ledger':               'PRO',
  'reconciliation':       'PRO',
  'payment-links':        'PRO',
  'hr':                   'PRO',
  'payroll':              'PRO',
  'security-settings':    'PRO',
  'api-keys':             'PRO',
  'scheduled-reports':    'PRO',

  // ── ENTERPRISE (KES 14,999/mo) ───────────────────────────────────────────
  'agent':            'ENTERPRISE',
  'field-orders':     'ENTERPRISE',
  'delivery-routes':  'ENTERPRISE',
  'hotel':            'ENTERPRISE',
  'channel-manager':  'ENTERPRISE',
  'forecasting':      'ENTERPRISE',
  'franchise':        'ENTERPRISE',
};

export function planRank(plan: Plan | string | undefined): number {
  // Case-insensitive on purpose. A paid activation writes planName from PLANS,
  // which is title case ("Enterprise"), while these keys are upper case — so a raw
  // lookup returned undefined and ranked a paying Enterprise customer as FREE.
  if (!plan) return 0;
  return PLAN_RANK[plan.toUpperCase() as Plan] ?? 0;
}

/**
 * Returns true if the user's plan meets or exceeds the minimum required for a feature.
 * Features not listed in FEATURE_PLANS are always accessible.
 * During TRIAL, grant full access. After trial expires or on ACTIVE subscription,
 * enforce the subscriptionTier.
 */
export function hasFeature(
  userPlan: Plan | string | undefined,
  featureKey: string,
  subscriptionStatus?: string,
  subscriptionTier?: string,
): boolean {
  const required = FEATURE_PLANS[featureKey];
  if (!required) return true;

  // Trial accounts get full access to evaluate all features
  if (subscriptionStatus === 'TRIAL') return true;

  // Use subscriptionTier from business settings (most accurate)
  const effectivePlan = subscriptionTier ?? userPlan ?? 'FREE';
  return planRank(effectivePlan) >= planRank(required);
}
