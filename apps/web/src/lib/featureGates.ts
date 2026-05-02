/**
 * Feature gate definitions — maps each route/feature key to the minimum plan required.
 * Use hasFeature() in components and the Layout nav filter.
 *
 * Plan hierarchy:  STARTER  <  PRO  <  ENTERPRISE
 */

export type Plan = 'STARTER' | 'PRO' | 'ENTERPRISE';

const PLAN_RANK: Record<Plan, number> = {
  STARTER: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

/**
 * Maps route segment (e.g. 'field-orders') → minimum plan.
 * Keys are derived from the nav item's `to` path by stripping the leading '/'.
 * Unlisted keys default to STARTER (always visible).
 */
export const FEATURE_PLANS: Record<string, Plan> = {
  // ── STARTER ──────────────────────────────────────────────────────────────
  'dashboard':    'STARTER',
  'pos':          'STARTER',
  'inventory':    'STARTER',
  'customers':    'STARTER',
  'reports':      'STARTER',
  'sales-list':   'STARTER',
  'cash-drawer':  'STARTER',
  'batch':        'STARTER',
  'settings':     'STARTER',

  // ── PRO ──────────────────────────────────────────────────────────────────
  'hospitality':          'PRO',
  'kds':                  'PRO',
  'layaway':              'PRO',
  'proforma':             'PRO',
  'prescriptions':        'PRO',
  'pharmacy':             'PRO',
  'appointments':         'PRO',
  'delivery':             'PRO',
  'delivery-management':  'PRO',
  'waitlist':             'PRO',
  'fuel-pump':            'PRO',
  'cybercafe':            'PRO',
  'serial':               'PRO',
  'recipe':               'PRO',
  'bundle':               'PRO',
  'suppliers':            'PRO',
  'rfq':                  'PRO',
  'transfers':            'PRO',
  'stocktake':            'PRO',
  'damaged-goods':        'PRO',
  'owner-dashboard':      'PRO',
  'expenses':             'PRO',
  'cheques':              'PRO',
  'ledger':               'PRO',
  'reconciliation':       'PRO',
  'payment-links':        'PRO',
  'hr':                   'PRO',
  'payroll':              'PRO',
  'promotions':           'PRO',
  'gift-cards':           'PRO',
  'security-settings':    'PRO',

  // ── ENTERPRISE ────────────────────────────────────────────────────────────
  'agent':            'ENTERPRISE',
  'field-orders':     'ENTERPRISE',
  'delivery-routes':  'ENTERPRISE',
  'hotel':            'ENTERPRISE',
  'channel-manager':  'ENTERPRISE',
  'forecasting':      'ENTERPRISE',
  'franchise':        'ENTERPRISE',
  'api-keys':         'ENTERPRISE',
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
  return planRank(userPlan ?? 'STARTER') >= planRank(required);
}
