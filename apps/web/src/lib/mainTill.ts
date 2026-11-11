/**
 * The first entry of the Sales menu is the business's main till, and it is a different screen for each kind of business
 * (POSRouterPage): a supermarket scanner till, restaurant tables, the fuel forecourt, a cybercafe session board. The menu used
 * to call all of them "Point of Sale" with the same trolley icon. This names it for what it opens.
 *
 * Two screens are reached by their own address as well as through the till (the fuel forecourt and the cybercafe board), so
 * those have no menu entry of their own: the till entry is lit up on them instead of listing the same screen twice.
 */
import { Coffee, Fuel, Monitor, Pill, Scissors, ShoppingCart, Store, Wine, Zap } from 'lucide-react';
import type { ComponentType } from 'react';

export interface MainTill {
  /** Sidebar and header title. */
  label: string;
  /** Phone bottom bar (a few letters). */
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
}

const TILLS: Record<string, MainTill> = {
  RETAIL:      { label: 'Point of Sale',    shortLabel: 'POS',     icon: ShoppingCart },
  SUPERMARKET: { label: 'Supermarket POS',  shortLabel: 'Till',    icon: Store },
  HOSPITALITY: { label: 'Restaurant POS',   shortLabel: 'Tables',  icon: Coffee },
  FAST_FOOD:   { label: 'Counter POS',      shortLabel: 'Counter', icon: Zap },
  BAR_TAB:     { label: 'Bar POS',          shortLabel: 'Bar',     icon: Wine },
  FUEL_PUMP:   { label: 'Fuel Forecourt',   shortLabel: 'Pumps',   icon: Fuel },
  CYBERCAFE:   { label: 'Cybercafe POS',    shortLabel: 'Sessions', icon: Monitor },
  CLINIC:      { label: 'Clinic POS',       shortLabel: 'Billing', icon: Pill },
  SALON:       { label: 'Salon POS',        shortLabel: 'Till',    icon: Scissors },
};

/** The main till for a business's posMode (case-insensitive); an unknown or missing mode gets the standard one. */
export function mainTillFor(posMode?: string | null): MainTill {
  return TILLS[(posMode ?? '').toUpperCase()] ?? TILLS.RETAIL;
}

/** Addresses that show the main till's screen as well as `/pos`, so the till entry counts as the current page on them. */
export const MAIN_TILL_ALIASES = ['/fuel-pump', '/cybercafe', '/supermart'] as const;

/** Is `pathname` the main till (`/pos`, or an address that shows the same screen)? */
export function isMainTillPath(pathname: string): boolean {
  return pathname === '/pos' || MAIN_TILL_ALIASES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * What the till should show, from the business settings the rest of the app already holds.
 * `loading` while there is nothing to go on, `unknown` when the settings could not be read (the till must not guess a
 * retail till then: a fuel station was shown the shop till), otherwise the business's main till.
 */
export function tillStateFor(settings: { posMode?: string | null } | undefined, isLoading: boolean): 'loading' | 'unknown' | string {
  if (settings) return settings.posMode || 'RETAIL';
  return isLoading ? 'loading' : 'unknown';
}
