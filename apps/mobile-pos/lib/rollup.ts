/**
 * Pure helpers for the multi-store roll-up.
 *
 * The API's `/reports/cross-store-dashboard` returns per-store totals and a
 * grand summary; everything here turns that into the comparisons an owner
 * actually reads — who is carrying the group, who slipped since last period,
 * and what each branch's share of the take is.
 *
 * No React, no react-native — unit-tested in plain Node.
 */

export interface StoreStat {
  storeId: string;
  storeName: string;
  storeCode: string;
  totalRevenueCents: number;
  totalVatCents: number;
  transactionCount: number;
  topItems: Array<{ itemId: string; name: string; qtySold: number; revenueCents: number }>;
  totalStockLines: number;
}

export interface CrossStoreResponse {
  stores: StoreStat[];
  summary: { totalRevenueCents: number; totalTransactions: number; storeCount: number };
}

export interface RankedStore extends StoreStat {
  /** Share of group revenue, 0–100, rounded to one decimal. */
  sharePct: number;
  /** Mean sale value for this store, in cents. */
  avgSaleCents: number;
  /** Percent change against the same store last period; null when incomparable. */
  changePct: number | null;
  rank: number;
}

/**
 * Percentage change from `previous` to `current`.
 *
 * Returns null when there is no baseline: going from zero to anything is not
 * "infinite growth", it's a store that just opened or had no sales, and showing
 * +∞% (or a bogus +100%) would be worse than showing nothing.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Share of a total, 0–100 with one decimal; 0 when the total is zero. */
export function sharePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Mean sale value, floored to whole cents; 0 when there were no sales. */
export function avgSaleCents(revenueCents: number, transactionCount: number): number {
  if (transactionCount <= 0) return 0;
  return Math.round(revenueCents / transactionCount);
}

/**
 * Rank stores by revenue, richest first, annotating share, average sale and
 * change against the previous period.
 *
 * Stores present in the previous period but gone from the current one are NOT
 * carried over — the current period defines the list, so a closed branch drops
 * off rather than lingering at zero.
 */
export function rankStores(
  current: StoreStat[] | undefined,
  previous?: StoreStat[] | undefined,
): RankedStore[] {
  const rows = current ?? [];
  const total = rows.reduce((sum, s) => sum + s.totalRevenueCents, 0);
  const prevById = new Map((previous ?? []).map((s) => [s.storeId, s.totalRevenueCents]));

  return [...rows]
    .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
    .map((s, i) => ({
      ...s,
      sharePct: sharePct(s.totalRevenueCents, total),
      avgSaleCents: avgSaleCents(s.totalRevenueCents, s.transactionCount),
      changePct: prevById.has(s.storeId)
        ? percentChange(s.totalRevenueCents, prevById.get(s.storeId)!)
        : null,
      rank: i + 1,
    }));
}

/** Group totals, derived from the rows so they always agree with the list. */
export function groupTotals(rows: StoreStat[] | undefined) {
  const list = rows ?? [];
  const totalRevenueCents = list.reduce((s, x) => s + x.totalRevenueCents, 0);
  const totalTransactions = list.reduce((s, x) => s + x.transactionCount, 0);
  const totalVatCents = list.reduce((s, x) => s + x.totalVatCents, 0);
  return {
    totalRevenueCents,
    totalTransactions,
    totalVatCents,
    storeCount: list.length,
    avgSaleCents: avgSaleCents(totalRevenueCents, totalTransactions),
    /** Stores that took nothing at all this period — the ones to ask about. */
    silentStores: list.filter((s) => s.transactionCount === 0).length,
  };
}

/**
 * Best sellers across the whole group.
 *
 * Each store reports its own top five, so the same product appears once per
 * store and has to be merged by name — `itemId` differs per store when a
 * product is stocked separately per branch.
 */
export function groupTopItems(
  rows: StoreStat[] | undefined,
  limit = 5,
): Array<{ name: string; qtySold: number; revenueCents: number }> {
  const byName = new Map<string, { name: string; qtySold: number; revenueCents: number }>();
  for (const store of rows ?? []) {
    for (const item of store.topItems ?? []) {
      const existing = byName.get(item.name);
      if (existing) {
        existing.qtySold += item.qtySold;
        existing.revenueCents += item.revenueCents;
      } else {
        byName.set(item.name, { name: item.name, qtySold: item.qtySold, revenueCents: item.revenueCents });
      }
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, limit);
}

export type RollupPeriod = 'today' | 'week' | 'month';

export const PERIOD_LABELS: Record<RollupPeriod, string> = {
  today: 'Today',
  week: 'Last 7 days',
  month: 'This month',
};

/**
 * Local-day boundaries for a period, plus the immediately preceding window of
 * the same length for comparison.
 *
 * Local (not UTC) midnight, matching the Reports screen: a bare date resolves to
 * UTC midnight and in EAT the end bound would land before the day's last sale.
 */
export function rollupRange(period: RollupPeriod, now: Date = new Date()) {
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'week') start.setDate(now.getDate() - 6);
  else if (period === 'month') start.setDate(1);
  start.setHours(0, 0, 0, 0);

  // Previous window: same length, ending the instant before this one starts.
  const spanMs = start.getTime() === end.getTime() ? 0 : end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);

  return { start, end, prevStart, prevEnd };
}
