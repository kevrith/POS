import { roundQty } from '../common/quantity';

/**
 * What is sitting on the shelf that is out of date or about to be, and what it cost. The point of the figure is the money
 * and the order to act in: expired first, then what expires within 30, 60 and 90 days.
 */
export interface LotRow { quantityRemaining: number; expiryDate: Date | null; status: string; unitCostCents: number }
export interface Bucket { lots: number; units: number; costCents: number }

export const BUCKETS = ['expired', 'within30', 'within60', 'within90', 'later', 'noExpiry', 'recalled'] as const;
export type BucketName = (typeof BUCKETS)[number];

const DAY_MS = 86_400_000;

/** Which bucket a lot belongs in. A recalled lot is its own bucket whatever its date: it has to go back, not be sold. */
export function bucketOf(lot: LotRow, now: Date): BucketName {
  if (lot.status === 'RECALLED') return 'recalled';
  if (!lot.expiryDate) return 'noExpiry';
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (lot.expiryDate < startOfToday) return 'expired';
  const days = Math.floor((lot.expiryDate.getTime() - startOfToday.getTime()) / DAY_MS);
  return days <= 30 ? 'within30' : days <= 60 ? 'within60' : days <= 90 ? 'within90' : 'later';
}

export function expirySummary(lots: LotRow[], now = new Date()): Record<BucketName | 'total', Bucket> {
  const out = Object.fromEntries([...BUCKETS, 'total'].map((b) => [b, { lots: 0, units: 0, costCents: 0 }])) as Record<BucketName | 'total', Bucket>;
  for (const lot of lots) {
    if (lot.status !== 'ACTIVE' && lot.status !== 'RECALLED') continue;
    if (!(lot.quantityRemaining > 0)) continue;
    for (const key of [bucketOf(lot, now), 'total'] as const) {
      out[key].lots += 1;
      out[key].units = roundQty(out[key].units + lot.quantityRemaining);
      out[key].costCents += Math.round(lot.quantityRemaining * lot.unitCostCents);
    }
  }
  return out;
}
