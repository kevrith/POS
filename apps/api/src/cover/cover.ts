import { BadRequestException } from '@nestjs/common';

/**
 * Rules for insurance cover and claims, kept free of the database so they can be tested on their own.
 *
 * A cover check is somebody's answer to "does this insurer cover this person today?". A claim leaves for the insurer only
 * once cover was found good, and (for SHA) once its diagnoses carry the ICD-11 code the insurer asks for.
 */

export const COVER_STATUSES = ['ELIGIBLE', 'NOT_ELIGIBLE', 'UNAVAILABLE'] as const;
export type CoverStatus = (typeof COVER_STATUSES)[number];
/** What the screen shows: the three answers, or no answer yet. "Not checked" is never read as eligible. */
export type CoverStanding = CoverStatus | 'NOT_CHECKED';

export const PROVIDER_KINDS = ['SHA', 'PRIVATE', 'CORPORATE', 'OTHER'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export interface CheckLike {
  providerId: string;
  memberNumber: string;
  status: string;
  visitId: string | null;
  checkedAt: Date;
}

/** A check made up to this long before the visit opened still counts: the patient may have phoned ahead. */
const AHEAD_MS = 12 * 60 * 60 * 1000;

const sameMember = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

/**
 * Where a patient stands with an insurer for this visit: the latest check on that insurer and member number that was made
 * for this visit (or shortly before it opened). A later answer replaces an earlier one, so "not eligible" followed by a
 * corrected member number that is eligible counts as eligible, and the other way round.
 */
export function coverStanding(checks: CheckLike[], visit: { id: string; createdAt: Date }, providerId: string, memberNumber: string): CoverStanding {
  const relevant = checks
    .filter((c) => c.providerId === providerId && sameMember(c.memberNumber, memberNumber))
    .filter((c) => c.visitId === visit.id || (c.visitId === null && c.checkedAt.getTime() >= visit.createdAt.getTime() - AHEAD_MS))
    .sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
  const latest = relevant[0];
  return latest && (COVER_STATUSES as readonly string[]).includes(latest.status) ? (latest.status as CoverStatus) : 'NOT_CHECKED';
}

/** The patient's share and the insurer's, in cents, adding up exactly to the total. */
export function splitBill(totalCents: number, patientPct: number): { patientCents: number; insurerCents: number } {
  const patientCents = Math.round((totalCents * patientPct) / 100);
  return { patientCents, insurerCents: totalCents - patientCents };
}

export interface ReadinessInput {
  providerKind: string;
  requiresEligibility: boolean;
  memberNumber: string | null;
  /** Standing of the cover check the claim relied on. */
  coverStatus: CoverStanding;
  diagnoses: Array<{ code?: string; icd11?: string; label: string }>;
  /** Services or medicines on the claim. */
  lineCount: number;
  /** A claim from a clinic visit needs a diagnosis; a pharmacy fill is backed by its prescription instead. */
  fromVisit: boolean;
}

/** What still stops this claim from being sent to the insurer, in words a clerk can act on. Empty means it is ready. */
export function claimReadiness(c: ReadinessInput): string[] {
  const out: string[] = [];
  if (!c.memberNumber?.trim()) out.push('Member number is missing');
  if (c.requiresEligibility && c.coverStatus !== 'ELIGIBLE') {
    out.push(c.coverStatus === 'NOT_ELIGIBLE' ? 'Cover was found not eligible' : 'Cover has not been confirmed');
  }
  if (c.lineCount === 0) out.push('No services or medicines on the claim');
  if (c.fromVisit && c.diagnoses.length === 0) out.push('No diagnosis recorded');
  if (c.providerKind === 'SHA' && c.diagnoses.some((d) => !d.icd11)) out.push('SHA needs an ICD-11 code on every diagnosis');
  return out;
}

export const AGE_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

export function ageDays(from: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000));
}

export function ageBucket(days: number): AgeBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export interface AgingRow { providerId: string; providerName: string; buckets: Record<AgeBucket, number>; totalCents: number; count: number }

/** What each insurer still owes, by how long ago the claim was raised. Approved claims owe what was approved, others what was billed. */
export function agingByProvider(
  claims: Array<{ providerId: string; providerName: string; status: string; billedCents: number; approvedCents: number; submittedAt: Date }>,
  now = new Date(),
): AgingRow[] {
  const rows = new Map<string, AgingRow>();
  for (const c of claims) {
    if (c.status !== 'SUBMITTED' && c.status !== 'APPROVED') continue;
    const owed = c.status === 'APPROVED' ? c.approvedCents : c.billedCents;
    const row = rows.get(c.providerId) ?? { providerId: c.providerId, providerName: c.providerName, buckets: { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }, totalCents: 0, count: 0 };
    row.buckets[ageBucket(ageDays(c.submittedAt, now))] += owed;
    row.totalCents += owed;
    row.count += 1;
    rows.set(c.providerId, row);
  }
  return [...rows.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** An ICD-11 code, written the way the classification writes it: 1F40, CA40.0, 5A11. Letters are upper case. */
export function cleanIcd11(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const code = String(value).trim().toUpperCase();
  if (!/^[0-9A-Z]{3,5}(\.[0-9A-Z]{1,3})?$/.test(code)) throw new BadRequestException(`"${code}" is not an ICD-11 code (like 1F40 or CA40.0)`);
  return code;
}
