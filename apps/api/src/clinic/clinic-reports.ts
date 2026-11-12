import { BadRequestException } from '@nestjs/common';
import { parseDiagnoses } from './diagnosis-codes';

/**
 * The clinic's numbers for a period: how many patients came and when, how long they waited, what they were diagnosed with,
 * how busy each doctor was, what the clinic earned from services and how the lab is doing. Free of the database so each
 * figure can be tested on its own. Days are Nairobi days: a visit at 23:30 belongs to that day, not the next.
 */

export const TZ = 'Africa/Nairobi';
export const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

export const nairobiDay = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: TZ });

const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** The period asked for: from and to are inclusive Nairobi days. Defaults to the last 30 days; refuses more than a year. */
export function resolveRange(from: unknown, to: unknown, now = new Date()): { from: string; to: string; start: Date; end: Date; days: string[] } {
  const today = nairobiDay(now);
  const toDay = to === undefined || to === '' ? today : to;
  const fromDay = from === undefined || from === '' ? nairobiDay(new Date(new Date(`${isDay(toDay) ? toDay : today}T12:00:00+03:00`).getTime() - 29 * DAY_MS)) : from;
  if (!isDay(fromDay) || !isDay(toDay)) throw new BadRequestException('Dates must be written like 2026-11-30');
  if (fromDay > toDay) throw new BadRequestException('The start date is after the end date');
  const days: string[] = [];
  for (let t = new Date(`${fromDay}T12:00:00+03:00`).getTime(); nairobiDay(new Date(t)) <= toDay; t += DAY_MS) {
    days.push(nairobiDay(new Date(t)));
    if (days.length > MAX_RANGE_DAYS) throw new BadRequestException(`Choose a period of at most ${MAX_RANGE_DAYS} days`);
  }
  return { from: fromDay, to: toDay, start: new Date(`${fromDay}T00:00:00+03:00`), end: new Date(`${toDay}T23:59:59.999+03:00`), days };
}

export interface VisitRow {
  id: string; status: string; priority: string; createdAt: Date; triagedAt: Date | null; consultStartedAt: Date | null; consultEndedAt: Date | null;
  completedAt: Date | null; doctorId: string | null; doctorName: string | null; patientId: string; diagnoses: string;
}
export interface PatientRow { id: string; sex: string | null; dateOfBirth: Date | null }

const FINISHED = ['READY_TO_BILL', 'COMPLETED'];

export function visitsPerDay(visits: VisitRow[], days: string[]) {
  const rows = new Map(days.map((d) => [d, { date: d, total: 0, completed: 0, cancelled: 0 }]));
  for (const v of visits) {
    const row = rows.get(nairobiDay(v.createdAt));
    if (!row) continue;
    row.total += 1;
    if (v.status === 'COMPLETED') row.completed += 1;
    if (v.status === 'CANCELLED') row.cancelled += 1;
  }
  return [...rows.values()];
}

export function statusCounts(visits: VisitRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of visits) out[v.status] = (out[v.status] ?? 0) + 1;
  return out;
}

const minutes = (from: Date | null, to: Date | null): number | null => {
  if (!from || !to) return null;
  const m = (to.getTime() - from.getTime()) / 60_000;
  return m >= 0 ? m : null;
};

const average = (nums: Array<number | null>): { avg: number | null; n: number } => {
  const xs = nums.filter((x): x is number => x !== null);
  return { avg: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null, n: xs.length };
};

/** How long patients waited to be triaged and to see a doctor, and how long a consultation took, in minutes. */
export function waitStats(visits: VisitRow[]) {
  return {
    toTriage: average(visits.map((v) => minutes(v.createdAt, v.triagedAt))),
    toDoctor: average(visits.map((v) => minutes(v.createdAt, v.consultStartedAt))),
    consultation: average(visits.map((v) => minutes(v.consultStartedAt, v.consultEndedAt))),
  };
}

/** Whole years between two dates (the age on the day of a visit), or null when the birth date is not known. */
export function ageAt(dob: Date | null, on: Date): number | null {
  if (!dob) return null;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  if (on.getUTCMonth() < dob.getUTCMonth() || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

export interface DiagnosisRow { key: string; code: string | null; icd11: string | null; label: string; total: number; under5: number; fiveAndOver: number; unknownAge: number }

/**
 * Diagnoses by how many visits they were made at, split into children under 5 and everyone else (the split morbidity
 * returns ask for). A diagnosis counts once per visit. Only visits whose consultation was finished are counted: notes
 * on a visit still in progress can change.
 */
export function topDiagnoses(visits: VisitRow[], patients: Map<string, PatientRow>, limit = 25): DiagnosisRow[] {
  const rows = new Map<string, DiagnosisRow>();
  for (const v of visits) {
    if (!FINISHED.includes(v.status)) continue;
    const age = ageAt(patients.get(v.patientId)?.dateOfBirth ?? null, v.createdAt);
    const seen = new Set<string>();
    for (const d of parseDiagnoses(v.diagnoses)) {
      const key = (d.code ?? d.label).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const row = rows.get(key) ?? { key, code: d.code ?? null, icd11: d.icd11 ?? null, label: d.label, total: 0, under5: 0, fiveAndOver: 0, unknownAge: 0 };
      row.total += 1;
      if (age === null) row.unknownAge += 1;
      else if (age < 5) row.under5 += 1;
      else row.fiveAndOver += 1;
      if (!row.icd11 && d.icd11) row.icd11 = d.icd11;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label)).slice(0, limit);
}

export interface DoctorRow { doctorId: string | null; doctorName: string; seen: number; completed: number; patients: number; avgConsultMinutes: number | null; avgWaitMinutes: number | null }

/** What each doctor did: patients taken in, how many of those were completed, distinct patients, and the average times. */
export function doctorWorkload(visits: VisitRow[]): DoctorRow[] {
  const groups = new Map<string, VisitRow[]>();
  for (const v of visits) {
    if (!v.consultStartedAt) continue;
    const key = v.doctorId ?? v.doctorName ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.values()].map((vs) => ({
    doctorId: vs[0].doctorId,
    doctorName: vs[0].doctorName ?? 'Unknown doctor',
    seen: vs.length,
    completed: vs.filter((v) => v.status === 'COMPLETED').length,
    patients: new Set(vs.map((v) => v.patientId)).size,
    avgConsultMinutes: average(vs.map((v) => minutes(v.consultStartedAt, v.consultEndedAt))).avg,
    avgWaitMinutes: average(vs.map((v) => minutes(v.createdAt, v.consultStartedAt))).avg,
  })).sort((a, b) => b.seen - a.seen);
}

export const AGE_BANDS = ['0-4', '5-17', '18-39', '40-59', '60+', 'Unknown'] as const;

/** Who came: patients seen (each person once, even with several visits), by sex and age band at their first visit in the period. */
export function demographics(visits: VisitRow[], patients: Map<string, PatientRow>) {
  const first = new Map<string, VisitRow>();
  for (const v of [...visits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (v.status === 'CANCELLED') continue;
    if (!first.has(v.patientId)) first.set(v.patientId, v);
  }
  const sex = { F: 0, M: 0, other: 0 };
  const bands: Record<string, number> = Object.fromEntries(AGE_BANDS.map((b) => [b, 0]));
  for (const [patientId, v] of first) {
    const p = patients.get(patientId);
    if (p?.sex === 'F') sex.F += 1; else if (p?.sex === 'M') sex.M += 1; else sex.other += 1;
    const age = ageAt(p?.dateOfBirth ?? null, v.createdAt);
    bands[age === null ? 'Unknown' : age < 5 ? '0-4' : age < 18 ? '5-17' : age < 40 ? '18-39' : age < 60 ? '40-59' : '60+'] += 1;
  }
  return { patients: first.size, sex, ageBands: AGE_BANDS.map((b) => ({ band: b, count: bands[b] })) };
}

export interface ChargeRow { visitId: string; name: string; quantity: number; unitPriceCents: number }

/** What the clinic charged for services on completed visits, by service. */
export function revenueByService(charges: ChargeRow[]) {
  const rows = new Map<string, { name: string; count: number; totalCents: number }>();
  for (const c of charges) {
    const row = rows.get(c.name) ?? { name: c.name, count: 0, totalCents: 0 };
    row.count += c.quantity;
    row.totalCents += Math.round(c.unitPriceCents * c.quantity);
    rows.set(c.name, row);
  }
  const services = [...rows.values()].sort((a, b) => b.totalCents - a.totalCents);
  return { totalCents: services.reduce((s, r) => s + r.totalCents, 0), services };
}

export interface LabItemRow { testName: string; status: string; hasCritical: boolean; createdAt: Date; verifiedAt: Date | null }

/** For each test: how many were ordered and released, how long release took, and how many had a critical result. */
export function labSummary(items: LabItemRow[]) {
  const rows = new Map<string, { testName: string; ordered: number; released: number; critical: number; hours: number[] }>();
  for (const i of items) {
    const row = rows.get(i.testName) ?? { testName: i.testName, ordered: 0, released: 0, critical: 0, hours: [] };
    row.ordered += 1;
    if (i.status === 'VERIFIED') {
      row.released += 1;
      const m = minutes(i.createdAt, i.verifiedAt);
      if (m !== null) row.hours.push(m / 60);
    }
    if (i.hasCritical && i.status !== 'PENDING') row.critical += 1;
    rows.set(i.testName, row);
  }
  const tests = [...rows.values()].map((r) => ({
    testName: r.testName, ordered: r.ordered, released: r.released, critical: r.critical,
    avgTurnaroundHours: r.hours.length ? Math.round((r.hours.reduce((a, b) => a + b, 0) / r.hours.length) * 10) / 10 : null,
  })).sort((a, b) => b.ordered - a.ordered);
  return { totalOrdered: items.length, totalReleased: tests.reduce((s, t) => s + t.released, 0), tests };
}
