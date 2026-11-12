/**
 * Selling a prescription-only or controlled medicine at the till. The server refuses it (code RESTRICTED_SALE) unless a
 * manager approves with a reason; a controlled drug also needs the person it goes to, for the register. Pure helpers, so the
 * rules are testable without a screen.
 */
import { ApiError } from './api';

export interface RestrictedFound { name: string; controlled: boolean }

export interface RestrictedApprovalInput {
  reason: string;
  managerPin?: string;
  patientName?: string;
  patientIdNumber?: string;
  prescriberName?: string;
}

/** The medicines the server refused, or null when the error is something else. */
export function restrictedFrom(err: unknown): RestrictedFound[] | null {
  if (!(err instanceof ApiError) || err.code !== 'RESTRICTED_SALE') return null;
  const list = Array.isArray(err.details) ? (err.details as Array<{ name?: unknown; controlled?: unknown }>) : [];
  return list.filter((d) => typeof d?.name === 'string').map((d) => ({ name: String(d.name), controlled: d.controlled === true }));
}

/** A manager or owner approves on their own login; anyone else needs a manager's PIN. */
export function canApproveAlone(role?: string | null): boolean {
  return ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'].includes(String(role ?? '').toUpperCase());
}

/** Is the form complete enough to send? */
export function approvalReady(a: RestrictedApprovalInput, role: string | null | undefined, controlled: boolean): boolean {
  if (a.reason.trim().length < 5) return false;
  if (!canApproveAlone(role) && !/^\d{4,8}$/.test((a.managerPin ?? '').trim())) return false;
  if (controlled && !(a.patientName ?? '').trim()) return false;
  return true;
}

/** What is sent with the sale: only what was filled in. */
export function approvalBody(a: RestrictedApprovalInput): RestrictedApprovalInput {
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return { reason: a.reason.trim(), managerPin: clean(a.managerPin), patientName: clean(a.patientName), patientIdNumber: clean(a.patientIdNumber), prescriberName: clean(a.prescriberName) };
}
