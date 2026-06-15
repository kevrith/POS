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
