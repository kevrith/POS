/**
 * Business-type (posMode) capability layer.
 *
 * The web app branches on `posMode` in two places: POSRouterPage renders a whole
 * separate POS page per mode, and the sidebar gates nav items with
 * `businessTypes: [...]` arrays. On a phone the first half makes no sense — every
 * vertical collapses to the same single-column cart — so mobile keeps ONE POS
 * screen and instead varies:
 *
 *   1. the pre-cart step   (which table / pump / station / patient),
 *   2. a few post-cart steps (send to kitchen, end session),
 *   3. which tabs and Manage tiles are visible.
 *
 * All three are driven by the capability map below rather than by switching on
 * the mode directly, so adding a vertical is one row here instead of an `if`
 * scattered across a dozen screens. Mirrors the web sidebar's `businessTypes`.
 *
 * Pure module — no React, no react-native imports — so it unit-tests in plain
 * Node. The hook lives in `usePosMode.ts`.
 */

export const POS_MODES = [
  'RETAIL',
  'SUPERMARKET',
  'HOSPITALITY',
  'FAST_FOOD',
  'BAR_TAB',
  'FUEL_PUMP',
  'CYBERCAFE',
  'CLINIC',
  'SALON',
] as const;

export type PosMode = (typeof POS_MODES)[number];

/** Matches the Prisma default on Business.posMode. */
export const DEFAULT_POS_MODE: PosMode = 'RETAIL';

/** Human labels for the settings picker. */
export const POS_MODE_LABELS: Record<PosMode, string> = {
  RETAIL: 'Retail Shop',
  SUPERMARKET: 'Supermarket',
  HOSPITALITY: 'Restaurant / Hotel',
  FAST_FOOD: 'Fast Food',
  BAR_TAB: 'Bar (tabs)',
  FUEL_PUMP: 'Fuel Station',
  CYBERCAFE: 'Cybercafe',
  CLINIC: 'Clinic / Pharmacy',
  SALON: 'Salon / Spa',
};

/**
 * Every mode-dependent behaviour in the app, named by what it DOES rather than
 * by which vertical it belongs to.
 *
 * `cybercafe` stations are deliberately absent: the stations sit at a fixed
 * counter where the operator already has the web app, so there is no mobile
 * story for them (see also `MOBILE_UNSUPPORTED_MODES`).
 */
export type Capability =
  | 'tables'        // dine-in table picker before the cart
  | 'kitchen'       // send-to-kitchen + phone KDS
  | 'serviceCharge' // service charge line on the bill
  | 'pumps'         // fuel pump authorize/stop
  | 'appointments'  // booking diary
  | 'prescriptions' // prescription capture at the till
  | 'layaway'       // pay-in-instalments, goods held
  | 'batches'       // batch + expiry tracking
  | 'recipes'       // recipe / BOM stock depletion
  | 'delivery';     // delivery orders + dispatch

const CAPABILITY_MODES: Record<Capability, readonly PosMode[]> = {
  tables: ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'],
  kitchen: ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'],
  serviceCharge: ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'],
  pumps: ['FUEL_PUMP'],
  appointments: ['CLINIC', 'SALON'],
  prescriptions: ['CLINIC'],
  layaway: ['RETAIL', 'SUPERMARKET'],
  batches: ['CLINIC', 'SUPERMARKET'],
  recipes: ['HOSPITALITY', 'FAST_FOOD'],
  delivery: ['HOSPITALITY', 'FAST_FOOD', 'RETAIL', 'SUPERMARKET'],
};

/**
 * Optional modules a business switches on next to its main till (Settings on the
 * web). A fuel station with a restaurant keeps FUEL_PUMP as its mode and enables
 * RESTAURANT, which brings tables + kitchen without changing the till.
 * Mirrors OPTIONAL_MODULES in @pos/shared (mobile is outside the workspace).
 */
export const OPTIONAL_MODULES = ['RESTAURANT', 'HOTEL'] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

const MODULE_CAPABILITIES: Record<OptionalModule, readonly Capability[]> = {
  RESTAURANT: ['tables', 'kitchen'],
  // The hotel (rooms, folios) is a web-only flow; it adds no phone capability.
  HOTEL: [],
};

/** Parse the stored JSON list (or an already-parsed array), ignoring unknown modules. */
export function parseEnabledModules(raw?: string | string[] | null): OptionalModule[] {
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list.filter((m): m is OptionalModule => (OPTIONAL_MODULES as readonly string[]).includes(m as string));
}

/**
 * Modes whose specialised flow is intentionally web-only. The app still works
 * for them (cart, payment, reports all behave); they just get no bespoke
 * pre-cart step. Kept explicit so it reads as a decision, not an oversight.
 */
export const MOBILE_UNSUPPORTED_MODES: readonly PosMode[] = ['CYBERCAFE'];

/**
 * Coerce whatever the API returns into a known mode.
 *
 * `Business.posMode` is a free-text String column, not an enum, so an unknown
 * or empty value is entirely possible — fall back to RETAIL (the column default
 * and the web router's `default:` branch) rather than throwing.
 */
export function normalizePosMode(raw?: string | null): PosMode {
  if (!raw) return DEFAULT_POS_MODE;
  const upper = raw.toUpperCase().trim();
  return (POS_MODES as readonly string[]).includes(upper)
    ? (upper as PosMode)
    : DEFAULT_POS_MODE;
}

/** True when the given mode, or a module the business enabled, supports the capability. */
export function hasCapability(
  mode: PosMode | string | null | undefined,
  cap: Capability,
  modules: readonly OptionalModule[] = [],
): boolean {
  if (CAPABILITY_MODES[cap].includes(normalizePosMode(mode as string))) return true;
  return modules.some((m) => MODULE_CAPABILITIES[m]?.includes(cap));
}

// Thin named wrappers — these read better at the call site than
// `hasCapability(mode, 'tables')` and keep screens free of string literals.
export const hasTables = (m?: string | null) => hasCapability(m, 'tables');
export const hasKitchen = (m?: string | null) => hasCapability(m, 'kitchen');
export const hasServiceCharge = (m?: string | null) => hasCapability(m, 'serviceCharge');
export const hasPumps = (m?: string | null) => hasCapability(m, 'pumps');
export const hasAppointments = (m?: string | null) => hasCapability(m, 'appointments');
export const hasPrescriptions = (m?: string | null) => hasCapability(m, 'prescriptions');
export const hasLayaway = (m?: string | null) => hasCapability(m, 'layaway');
export const hasBatches = (m?: string | null) => hasCapability(m, 'batches');
export const hasRecipes = (m?: string | null) => hasCapability(m, 'recipes');
export const hasDelivery = (m?: string | null) => hasCapability(m, 'delivery');

/**
 * Nav-item filter shared by the tab bar and the Manage tile grid.
 *
 * An item with no `modes` is universal (the common case — cash drawer, reports,
 * stock all apply everywhere); one WITH `modes` shows only for those verticals.
 * Same shape as the web sidebar's optional `businessTypes`.
 */
export function isVisibleForMode(
  modes: readonly PosMode[] | undefined,
  mode: PosMode | string | null | undefined,
  /** Modules the business enabled, and the ones that also reveal this item. */
  extra?: { enabled: readonly OptionalModule[]; modules?: readonly OptionalModule[] },
): boolean {
  if (!modes || modes.length === 0) return true;
  if (modes.includes(normalizePosMode(mode as string))) return true;
  return !!extra?.modules?.some((m) => extra.enabled.includes(m));
}

/** Label for the current mode, for settings + the Manage header. */
export function posModeLabel(mode?: string | null): string {
  return POS_MODE_LABELS[normalizePosMode(mode)];
}
