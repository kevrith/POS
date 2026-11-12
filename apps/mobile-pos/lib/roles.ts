/**
 * Role gating for the Manage section.
 *
 * The mobile app is a "floor" app: cashiers and waiters only see POS/Sales/etc.
 * The Manage tab (stock, transfers, users, settings) is reserved for the people
 * who actually run the business. Kept as a pure function (no imports) so it is
 * trivially unit-testable and reusable from any screen.
 */
export const MANAGE_ROLES = ['OWNER', 'MANAGER', 'ADMIN'] as const;

export type ManageRole = (typeof MANAGE_ROLES)[number];

/**
 * Clinic roles whose work is on the web and desktop apps (patients, visits, the lab). This app has none of those screens and the
 * server would refuse everything else they try, so they are told where to sign in instead of landing on an empty till.
 */
export const NOT_ON_MOBILE = ['DOCTOR', 'NURSE', 'LAB_TECH'] as const;

/** A sentence for a role that should not sign in here, or null when the role belongs on this app. */
export function mobileSignInBlock(role?: string | null): string | null {
  if (!role || !(NOT_ON_MOBILE as readonly string[]).includes(role.toUpperCase())) return null;
  return 'Your work is on the web or desktop app: the clinic screens (patients, visits, the lab) are not on the phone app. Sign in there.';
}

/** True when the given role may access the Manage section. Case-insensitive. */
export function canManage(role?: string | null): boolean {
  if (!role) return false;
  return (MANAGE_ROLES as readonly string[]).includes(role.toUpperCase());
}

/** Only OWNER/ADMIN may manage staff accounts and business-wide settings. */
export function canManageBusiness(role?: string | null): boolean {
  if (!role) return false;
  const r = role.toUpperCase();
  return r === 'OWNER' || r === 'ADMIN';
}

/**
 * Roles allowed to see money: reports, expenses, cash-drawer oversight, X/Z.
 *
 * ACCOUNTANT is deliberately NOT in MANAGE_ROLES — an accountant has no business
 * adjusting stock or editing staff — but the web app grants them the whole
 * Finance group (reports, sales history, expenses, cheques, ledger,
 * reconciliation). Before this split mobile locked them out of everything, which
 * was a straight regression against web for that role.
 */
export const FINANCE_ROLES = ['OWNER', 'MANAGER', 'ADMIN', 'ACCOUNTANT'] as const;

/** True when the role may view financial data (superset of {@link canManage}). */
export function canSeeFinance(role?: string | null): boolean {
  if (!role) return false;
  return (FINANCE_ROLES as readonly string[]).includes(role.toUpperCase());
}

/**
 * True when the role may approve things other people submitted — leave,
 * expenses, purchase orders, salary advances.
 *
 * Intentionally excludes ACCOUNTANT: they can *see* the money but approving
 * spend is a management act. Same line the web approval chain draws.
 */
export function canApprove(role?: string | null): boolean {
  return canManage(role);
}

/**
 * True when the role may browse the full sales history for the store.
 *
 * Cashiers and waiters see only their OWN sales — the mobile Sales tab used to
 * list every sale in the store with the cashier's name attached, letting any
 * cashier browse their colleagues' takings. Web has always restricted
 * `/sales-list` to OWNER/MANAGER/ACCOUNTANT.
 */
export function canSeeAllSales(role?: string | null): boolean {
  return canSeeFinance(role);
}
