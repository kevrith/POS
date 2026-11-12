import type { BadgeTone } from '../components/ui';

export type CoverStanding = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNAVAILABLE' | 'NOT_CHECKED';

export const COVER_LABEL: Record<CoverStanding, string> = {
  ELIGIBLE: 'Cover confirmed',
  NOT_ELIGIBLE: 'Not eligible',
  UNAVAILABLE: 'Could not be checked',
  NOT_CHECKED: 'Not checked yet',
};

export const COVER_TONE: Record<CoverStanding, BadgeTone> = { ELIGIBLE: 'success', NOT_ELIGIBLE: 'danger', UNAVAILABLE: 'warning', NOT_CHECKED: 'neutral' };

export const PROVIDER_KIND_LABEL: Record<string, string> = { SHA: 'SHA (Social Health Authority)', PRIVATE: 'Private insurer', CORPORATE: 'Corporate scheme', OTHER: 'Other' };

export interface InsuranceProvider {
  id: string; name: string; code: string; kind: string; requiresEligibility: boolean; isActive: boolean;
  contactPhone: string | null; contactEmail: string | null;
}

export interface CoverCheck {
  id: string; patientId: string; providerId: string; providerName: string; visitId: string | null; memberNumber: string;
  status: Exclude<CoverStanding, 'NOT_CHECKED'>; method: string; reference: string | null; notes: string | null;
  checkedByName: string; checkedAt: string;
}

export interface ClaimRow {
  id: string; claimNumber: string | null; status: 'SUBMITTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'VOIDED';
  providerId: string; providerName: string; providerKind: string; patientId: string | null; patientName: string; memberNumber: string | null;
  visitId: string | null; prescriptionId: string | null; saleId: string | null;
  billedCents: number; approvedCents: number; paidCents: number; copayPct: number; preauthNumber: string | null; rejectionReason: string | null;
  submittedAt: string; paidAt: string | null; ageDays: number | null; problems: string[];
  resubmittedFromId: string | null; resubmittedToId: string | null;
}

export interface ClaimDetail extends ClaimRow {
  lines: Array<{ name: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  diagnoses: Array<{ code?: string; icd11?: string; label: string }>;
}

export interface AgingRow { providerId: string; providerName: string; buckets: Record<'0-30' | '31-60' | '61-90' | '90+', number>; totalCents: number; count: number }

export const CLAIM_STATUS_LABEL: Record<ClaimRow['status'], string> = { SUBMITTED: 'Billed', APPROVED: 'Approved', PAID: 'Paid', REJECTED: 'Rejected', VOIDED: 'Voided' };

export const AGE_BUCKETS_LABEL = { '0-30': '0-30 days', '31-60': '31-60 days', '61-90': '61-90 days', '90+': 'Over 90 days' } as const;

// ── the facility's connection to SHA ──────────────────────────────────────────────────────────────────────────────

export const SHA_ID_TYPES = ['National ID', 'ClientRegistry ID', 'Alien ID', 'Refugee ID', 'Mandate Number', 'Birth Certificate', 'Birth Notification'] as const;

export interface ShaConnection {
  baseUrl: string; clientId: string; facilityCode: string; tokenPath: string; eligibilityPath: string; tokenFormat: 'json' | 'form';
  enabled: boolean; secretSet: boolean; lastTestAt: string | null; lastTestOk: boolean | null; lastTestMessage: string | null;
}
export interface ShaConfig { defaults: { baseUrl: string; tokenPath: string; eligibilityPath: string; tokenFormat: string }; connection: ShaConnection | null }

export interface ShaResult {
  recorded: boolean;
  verdict: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN' | 'AUTH' | 'BAD_INPUT' | 'DOWN' | 'UNREACHABLE';
  status?: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNAVAILABLE';
  summary?: string; message?: string; memberCrNumber?: string | null; fullName?: string | null;
  schemes?: Array<{ name: string; status: string; verdict: string; reason: string | null; endDate: string | null }>;
}
