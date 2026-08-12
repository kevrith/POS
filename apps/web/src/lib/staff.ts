/**
 * Helpers for narrowing a business's staff list down to the people who can
 * actually fill a given job, so a driver picker never offers a cashier.
 *
 * Each helper degrades gracefully: if nobody carries the dedicated role yet
 * (common right after upgrading, before staff roles are re-assigned) the full
 * list is returned along with `usingFallback: true` so the UI can explain why.
 */

export interface StaffUser {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  phone?: string | null;
}

export interface RoleFilterResult<T> {
  /** People to offer in the picker. */
  users: T[];
  /** True when no user carries the role and every staff member is being shown. */
  usingFallback: boolean;
}

function byRole<T extends { role: string }>(
  users: T[],
  roles: string[],
): RoleFilterResult<T> {
  const matched = users.filter((u) => roles.includes(u.role));
  if (matched.length > 0) return { users: matched, usingFallback: false };
  return { users, usingFallback: true };
}

/** Staff who can be assigned to a delivery run. */
export function selectDrivers<T extends { role: string }>(users: T[]): RoleFilterResult<T> {
  return byRole(users, ['DRIVER']);
}

/** Staff who can raise field orders on a route. */
export function selectSalesAgents<T extends { role: string }>(users: T[]): RoleFilterResult<T> {
  return byRole(users, ['SALES_AGENT']);
}

export const NO_DRIVERS_HINT =
  'No staff have the Driver role yet — showing everyone. Add drivers in Settings → Users to keep this list clean.';

export const NO_AGENTS_HINT =
  'No staff have the Sales Agent role yet — showing everyone. Add agents in Settings → Users to keep this list clean.';
