import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

/**
 * The parts of talking to the Social Health Authority's eligibility service that need no network: which addresses may be
 * called, what an answer means, and what the clerk is told. Written from DHA's published eligibility documentation
 * (hie-docs.dha.go.ke); where that documentation is silent (the exact values of a coverage status, the token request format)
 * the code refuses to guess: an answer it cannot read is "unknown", never "eligible".
 */

export const SHA_ID_TYPES = ['National ID', 'ClientRegistry ID', 'Birth Notification', 'Birth Certificate', 'Alien ID', 'Refugee ID', 'Mandate Number'] as const;
export type ShaIdType = (typeof SHA_ID_TYPES)[number];

/** DHA's published test (UAT) address. The live address is given to a facility by SHA when it is onboarded. */
export const UAT_BASE_URL = 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1';

const OFFICIAL = ['dha.go.ke', 'sha.go.ke'];

/** Hosts a server operator may add (comma separated in SHA_EXTRA_HOSTS), for a network gateway or a local test. */
export const extraHosts = (): string[] => (process.env.SHA_EXTRA_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

export function hostAllowed(host: string, extra: string[] = []): boolean {
  const h = host.toLowerCase();
  return extra.includes(h) || OFFICIAL.some((d) => h === d || h.endsWith(`.${d}`));
}

/**
 * The address a facility typed, made safe to call: https only (http only for an operator-allowed host), no credentials in it,
 * no IP address, and only SHA / DHA hosts. The server makes this call on the facility's behalf, so it must not be turned into a
 * way to reach other machines.
 */
export function validateBaseUrl(raw: unknown, extra: string[] = extraHosts()): string {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new BadRequestException('The service address is not a valid web address'); }
  const operatorHost = extra.includes(u.hostname.toLowerCase());
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && operatorHost)) throw new BadRequestException('The service address must start with https://');
  if (u.username || u.password) throw new BadRequestException('Do not put a username or password in the address');
  if (isIP(u.hostname) && !operatorHost) throw new BadRequestException('Use the service\'s host name, not an IP address');
  if (!hostAllowed(u.hostname, extra)) throw new BadRequestException('Only addresses on SHA\'s or DHA\'s own domains (ending .sha.go.ke or .dha.go.ke) are accepted');
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
}

export function validatePath(raw: unknown, label: string): string {
  const p = String(raw ?? '').trim();
  if (!/^\/[A-Za-z0-9._\-/]{0,98}$/.test(p) || p.includes('..') || p.includes('//')) throw new BadRequestException(`${label} must be a path such as /patients/eligibility`);
  return p;
}

export type Verdict = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';

const NOT = /\b(inactive|not\s+active|ineligible|not\s+eligible|expired|suspended|lapsed|arrears|terminated|defaulted|no\s+active|not\s+covered|uncovered)\b/i;
const YES = /\b(active|eligible|covered)\b/i;

/** What one scheme's coverage status says. Wording that is neither clearly yes nor clearly no is UNKNOWN. */
export function classifyCoverage(status: unknown): Verdict {
  const s = typeof status === 'string' ? status.trim() : typeof status === 'boolean' ? String(status) : '';
  if (!s) return 'UNKNOWN';
  if (NOT.test(s) || /^(false|no|0|inactive)$/i.test(s)) return 'NOT_ELIGIBLE';
  if (YES.test(s) || /^(true|yes|1)$/i.test(s)) return 'ELIGIBLE';
  return 'UNKNOWN';
}

export interface SchemeResult { name: string; status: string; verdict: Verdict; reason: string | null; endDate: string | null }
export interface Interpretation { verdict: Verdict; summary: string; memberCrNumber: string | null; fullName: string | null; schemes: SchemeResult[]; deceased: boolean }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

/**
 * Read an eligibility answer (shape from DHA's documentation: `schemes[].coverage.status`, `isAlive`, `memberCrNumber`).
 * Eligible only when a scheme's coverage clearly says so and the person is not recorded as deceased; not eligible only when
 * every scheme clearly says not (or the person is deceased); anything else is unknown and is left for a person to decide.
 */
export function interpretEligibility(body: unknown): Interpretation {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const rawSchemes = Array.isArray(b.schemes) ? (b.schemes as Array<Record<string, unknown>>) : [];
  const schemes: SchemeResult[] = rawSchemes.map((s) => {
    const cov = (s?.coverage && typeof s.coverage === 'object' ? s.coverage : {}) as Record<string, unknown>;
    return { name: str(s?.schemeName) ?? 'Scheme', status: str(cov.status) ?? '', verdict: classifyCoverage(cov.status), reason: str(cov.reason) ?? str(cov.message), endDate: str(cov.endDate) };
  });
  const base = { memberCrNumber: str(b.memberCrNumber), fullName: str(b.fullName), schemes };
  if (b.isAlive === false) return { ...base, verdict: 'NOT_ELIGIBLE', summary: 'SHA records this person as deceased. Do not proceed.', deceased: true };
  const line = (s: SchemeResult) => `${s.name}: ${s.status || 'no status'}${s.reason && s.verdict !== 'ELIGIBLE' ? ` (${s.reason})` : ''}`;
  if (schemes.some((s) => s.verdict === 'ELIGIBLE')) return { ...base, verdict: 'ELIGIBLE', deceased: false, summary: schemes.map(line).join('; ') };
  if (schemes.length > 0 && schemes.every((s) => s.verdict === 'NOT_ELIGIBLE')) return { ...base, verdict: 'NOT_ELIGIBLE', deceased: false, summary: schemes.map(line).join('; ') };
  return { ...base, verdict: 'UNKNOWN', deceased: false, summary: schemes.length > 0 ? `SHA answered but the coverage could not be read as active or inactive: ${schemes.map(line).join('; ')}` : 'SHA answered with no coverage information' };
}

export type Outcome = { kind: 'OK' } | { kind: 'NOT_FOUND' | 'BAD_INPUT' | 'AUTH' | 'DOWN'; message: string };

/** What an HTTP status from the eligibility call means for the clerk. */
export function outcomeOf(status: number): Outcome {
  if (status >= 200 && status < 300) return { kind: 'OK' };
  if (status === 404) return { kind: 'NOT_FOUND', message: 'SHA has no record of this person with that identifier (not found in the Client Registry).' };
  if (status === 400 || status === 422) return { kind: 'BAD_INPUT', message: 'SHA did not accept the identifier. Check the type and the number.' };
  if (status === 401 || status === 403) return { kind: 'AUTH', message: 'SHA refused the facility\'s credentials. Check the client id, secret and facility code under SHA connection.' };
  return { kind: 'DOWN', message: `SHA's service is not answering properly (status ${status}). Try again, or record the result by hand.` };
}

/** An identifier the clerk typed, checked before anything is sent. */
export function cleanIdentifier(type: unknown, number: unknown): { type: ShaIdType; number: string } {
  const t = SHA_ID_TYPES.find((x) => x === type);
  if (!t) throw new BadRequestException(`Identifier type must be one of: ${SHA_ID_TYPES.join(', ')}`);
  const n = String(number ?? '').trim();
  if (!/^[A-Za-z0-9\-/ ._]{3,40}$/.test(n)) throw new BadRequestException('Enter the identifier number (3 to 40 letters and digits)');
  return { type: t, number: n };
}
