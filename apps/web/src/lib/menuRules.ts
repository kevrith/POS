/**
 * Which menu entries a business sees, decided by its main till (posMode) and the optional modules it switched on.
 *
 * One table for the desktop sidebar and the phone menu. Each used to carry its own copy of these rules, and an entry with no
 * rule showed for EVERY kind of business: a salon was offered Field Orders, Delivery Routes and Proformas, and a
 * table-service restaurant was offered Delivery and Online Orders. Roles and plan limits are separate checks that stay in
 * the menus; this answers only "does this kind of business use it?".
 *
 * An entry with no rule here is for every business. To add one for a kind of business, give it `businessTypes`; to let any
 * business switch it on, give it a `feature` (an optional module, see @pos/shared).
 */
import { moduleIncludedByMode, type OptionalModule } from '@pos/shared';

export interface MenuRule {
  /** Shown for these main tills. */
  businessTypes?: readonly string[];
  /** Also shown when the business switched one of these modules on, whatever its main till. */
  modules?: readonly string[];
  /** Hidden for these main tills even when a module would show it (the entry exists elsewhere for them). */
  notForTypes?: readonly string[];
  /** An optional module: shown when the main till includes it or the owner (or first use) switched it on. */
  feature?: OptionalModule;
  /** Shown to these roles whatever the business has (a sales agent always sees their own board). */
  alwaysForRoles?: readonly string[];
}

const RESTAURANT_TILLS = ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'] as const;

export const MENU_RULES: Record<string, MenuRule> = {
  // Restaurant
  '/kds': { businessTypes: RESTAURANT_TILLS, modules: ['RESTAURANT'] },
  '/hospitality': { businessTypes: [], modules: ['RESTAURANT'], notForTypes: RESTAURANT_TILLS },
  '/waitlist': { businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
  '/recipe': { businessTypes: ['HOSPITALITY', 'FAST_FOOD'] },
  // Hotel
  '/hotel': { businessTypes: ['HOSPITALITY'], modules: ['HOTEL'] },
  '/channel-manager': { businessTypes: ['HOSPITALITY'], modules: ['HOTEL'] },
  // Goods sold to people elsewhere or on account: shops, supermarkets, takeaways; anyone else can switch them on
  '/delivery': { feature: 'DELIVERY' },
  '/online-orders': { feature: 'DELIVERY' },
  '/delivery-management': { feature: 'DELIVERY' },
  '/field-orders': { feature: 'FIELD_SALES' },
  '/delivery-routes': { feature: 'FIELD_SALES' },
  '/agent': { feature: 'FIELD_SALES', alwaysForRoles: ['SALES_AGENT'] },
  '/proforma': { feature: 'QUOTES' },
  // Shops
  '/layaway': { businessTypes: ['RETAIL', 'SUPERMARKET'] },
  '/serial': { businessTypes: ['RETAIL'] },
  '/batch': { businessTypes: ['CLINIC', 'SUPERMARKET'] },
  // Other kinds of business
  '/prescriptions': { businessTypes: ['CLINIC'] },
  '/pharmacy': { businessTypes: ['CLINIC'] },
  '/appointments': { businessTypes: ['CLINIC', 'SALON'] },
  '/fuel-pump': { businessTypes: ['FUEL_PUMP'] },
  // A fuel station's /pos is the forecourt; its shop, lubricants and LPG are sold on the standard till here
  '/shop-till': { businessTypes: ['FUEL_PUMP'] },
  // Tools a fuel station has no use for (kits of goods, tenders to suppliers for a shop range, demand forecasts, gift cards)
  '/bundle': { notForTypes: ['FUEL_PUMP'] },
  '/rfq': { notForTypes: ['FUEL_PUMP'] },
  '/forecasting': { notForTypes: ['FUEL_PUMP'] },
  '/gift-cards': { notForTypes: ['FUEL_PUMP'] },
  '/cybercafe': { businessTypes: ['CYBERCAFE'] },
};

export interface MenuContext {
  /** The business's main till, e.g. "SALON". */
  posMode: string;
  /** The optional modules it switched on. */
  enabledModules: readonly string[];
  role?: string;
}

/** Does this kind of business use the menu entry at `path`? (Roles and plan limits are checked separately.) */
export function menuVisible(path: string, ctx: MenuContext): boolean {
  const rule = MENU_RULES[path];
  if (!rule) return true;
  const mode = ctx.posMode.toUpperCase();

  if (rule.alwaysForRoles && ctx.role && rule.alwaysForRoles.includes(ctx.role)) return true;
  if (rule.notForTypes?.includes(mode)) return false;
  if (rule.feature) return moduleIncludedByMode(rule.feature, mode) || ctx.enabledModules.includes(rule.feature);
  if (!rule.businessTypes && !rule.modules) return true;
  if (rule.businessTypes?.includes(mode)) return true;
  return !!rule.modules?.some((m) => ctx.enabledModules.includes(m));
}
