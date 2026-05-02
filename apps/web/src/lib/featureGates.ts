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
  STARTER:    { stores: 1, users: 5 },
  GROWTH:     { stores: 2, users: 8 },
  PRO:        { stores: 5, users: 15 },
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

  // ── STARTER (KES 999/mo) ─────────────────────────────────────────────────
  'batch':        'STARTER',
  'reports':      'STARTER',
  'settings':     'STARTER',

  // ── GROWTH (KES 2,499/mo) ────────────────────────────────────────────────
  'hospitality':          'GROWTH',
  'kds':                  'GROWTH',
  'layaway':              'GROWTH',
  'proforma':             'GROWTH',
  'prescriptions':        'GROWTH',
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
  return PLAN_RANK[(plan as Plan)] ?? 0;
}

/**
 * Returns true if the user's plan meets or exceeds the minimum required for a feature.
 * Features not listed in FEATURE_PLANS are always accessible.
 */
export function hasFeature(userPlan: Plan | string | undefined, featureKey: string): boolean {
  const required = FEATURE_PLANS[featureKey];
  if (!required) return true;
  return planRank(userPlan ?? 'FREE') >= planRank(required);
}
