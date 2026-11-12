import { toCsv } from './csv';

/** The clinic report's shape (as the API sends it) and the helpers the page uses to present and export it. */

export interface ReportDay { date: string; total: number; completed: number; cancelled: number }
export interface AvgStat { avg: number | null; n: number }
export interface ReportDiagnosis { key: string; code: string | null; icd11: string | null; label: string; total: number; under5: number; fiveAndOver: number; unknownAge: number }
export interface ReportDoctor { doctorId: string | null; doctorName: string; seen: number; completed: number; patients: number; avgConsultMinutes: number | null; avgWaitMinutes: number | null }

export interface ClinicReport {
  range: { from: string; to: string };
  truncated: boolean;
  totals: { visits: number; completed: number; cancelled: number; open: number; urgent: number };
  perDay: ReportDay[];
  waits: { toTriage: AvgStat; toDoctor: AvgStat; consultation: AvgStat };
  diagnoses: ReportDiagnosis[];
  doctors: ReportDoctor[];
  demographics: { patients: number; sex: { F: number; M: number; other: number }; ageBands: Array<{ band: string; count: number }> };
  revenue: { totalCents: number; services: Array<{ name: string; count: number; totalCents: number }> };
  lab: { totalOrdered: number; totalReleased: number; tests: Array<{ testName: string; ordered: number; released: number; critical: number; avgTurnaroundHours: number | null }> };
}

/** Nairobi calendar day as YYYY-MM-DD, shifted by whole days. */
export function nairobiDate(daysAgo = 0, now = new Date()): string {
  return new Date(now.getTime() - daysAgo * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

export type Preset = 'today' | '7d' | '30d' | 'month';

export function presetRange(preset: Preset, now = new Date()): { from: string; to: string } {
  const to = nairobiDate(0, now);
  if (preset === 'today') return { from: to, to };
  if (preset === '7d') return { from: nairobiDate(6, now), to };
  if (preset === 'month') return { from: `${to.slice(0, 8)}01`, to };
  return { from: nairobiDate(29, now), to };
}

/** "12 min", "1 h 5 min", or a dash when nobody has been measured. */
export function formatMinutes(m: number | null): string {
  if (m === null) return '-';
  const total = Math.round(m);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

export function diagnosesCsv(rows: ReportDiagnosis[]): string {
  const head = ['ICD-10', 'ICD-11', 'Diagnosis', 'Visits', 'Under 5', '5 and over', 'Age unknown'];
  return toCsv([head, ...rows.map((r) => [r.code, r.icd11, r.label, r.total, r.under5, r.fiveAndOver, r.unknownAge])]);
}
