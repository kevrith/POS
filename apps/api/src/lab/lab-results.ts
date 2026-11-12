import { BadRequestException } from '@nestjs/common';
import { numberInRange, optionalText, text } from '../common/validate';

/**
 * What a lab test measures, how an entered value is checked, and how it is judged against the normal range.
 * Free of the database so the rules can be tested on their own.
 */

export const PARAM_KINDS = ['NUMERIC', 'CHOICE', 'TEXT'] as const;
export type ParamKind = (typeof PARAM_KINDS)[number];

export const LAB_CATEGORIES = ['HAEMATOLOGY', 'CHEMISTRY', 'MICROBIOLOGY', 'PARASITOLOGY', 'SEROLOGY', 'URINALYSIS', 'IMAGING', 'OTHER'] as const;
export const SPECIMENS = ['BLOOD', 'URINE', 'STOOL', 'SWAB', 'SPUTUM', 'OTHER', 'NONE'] as const;

export interface LabParameter {
  name: string;
  kind: ParamKind;
  unit?: string;
  /** Normal range for adults. `lowF` and `highF` replace it for female patients when set. */
  low?: number;
  high?: number;
  lowF?: number;
  highF?: number;
  /** Normal range for children under 12, which replaces the adult one for them when set. */
  lowC?: number;
  highC?: number;
  /** Below or above these the result is critical: the doctor needs to know now. */
  critLow?: number;
  critHigh?: number;
  /** For CHOICE: what may be entered, and which of those choices is abnormal. */
  choices?: string[];
  abnormal?: string[];
}

export type Flag = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';

export interface LabValue { name: string; value: string; unit?: string; low?: number; high?: number; flag: Flag | null }

const num = (v: unknown, label: string): number | undefined =>
  v === undefined || v === null || v === '' ? undefined : numberInRange(v, label, { min: -1_000_000, max: 1_000_000 });

/** The parameters a manager sent for a test, cleaned. Every parameter has a distinct name; ranges must make sense. */
export function cleanParameters(value: unknown): LabParameter[] {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequestException('A test needs at least one thing to measure');
  if (value.length > 40) throw new BadRequestException('At most 40 parameters on one test');
  const seen = new Set<string>();
  return value.map((raw: Record<string, unknown>) => {
    const name = text(raw?.name, 'Parameter name', 80);
    if (seen.has(name.toLowerCase())) throw new BadRequestException(`"${name}" is listed twice`);
    seen.add(name.toLowerCase());
    const kind = String(raw.kind ?? 'NUMERIC').toUpperCase();
    if (!(PARAM_KINDS as readonly string[]).includes(kind)) throw new BadRequestException(`${name}: result type must be NUMERIC, CHOICE or TEXT`);
    const p: LabParameter = { name, kind: kind as ParamKind };
    const unit = optionalText(raw.unit, 'Unit', 30);
    if (unit) p.unit = unit;
    if (kind === 'NUMERIC') {
      for (const k of ['low', 'high', 'lowF', 'highF', 'lowC', 'highC', 'critLow', 'critHigh'] as const) {
        const n = num(raw[k], `${name}: ${k}`);
        if (n !== undefined) p[k] = n;
      }
      if (p.low !== undefined && p.high !== undefined && p.low > p.high) throw new BadRequestException(`${name}: the normal range's low is above its high`);
      if (p.lowF !== undefined && p.highF !== undefined && p.lowF > p.highF) throw new BadRequestException(`${name}: the female range's low is above its high`);
      if (p.lowC !== undefined && p.highC !== undefined && p.lowC > p.highC) throw new BadRequestException(`${name}: the child range's low is above its high`);
      if (p.critLow !== undefined && p.low !== undefined && p.critLow > p.low) throw new BadRequestException(`${name}: the critical low must be below the normal range`);
      if (p.critHigh !== undefined && p.high !== undefined && p.critHigh < p.high) throw new BadRequestException(`${name}: the critical high must be above the normal range`);
    } else if (kind === 'CHOICE') {
      const choices = Array.isArray(raw.choices) ? raw.choices.map((c) => text(c, 'Choice', 60)) : [];
      if (choices.length < 2) throw new BadRequestException(`${name}: give at least two choices`);
      p.choices = [...new Set(choices)];
      const abnormal = Array.isArray(raw.abnormal) ? raw.abnormal.map((c) => text(c, 'Abnormal choice', 60)) : [];
      const bad = abnormal.find((a) => !p.choices!.includes(a));
      if (bad) throw new BadRequestException(`${name}: "${bad}" is marked abnormal but is not one of the choices`);
      if (abnormal.length) p.abnormal = abnormal;
    }
    return p;
  });
}

export function parseParameters(raw: unknown): LabParameter[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? (v as LabParameter[]) : [];
  } catch {
    return [];
  }
}

export const CHILD_UNDER_YEARS = 12;

/** The normal range that applies to this patient: the child range under 12 when the test has one, else the female range for a female patient when it has one, else the adult range. */
export function rangeFor(p: LabParameter, sex: string | null | undefined, ageYears?: number | null): { low?: number; high?: number } {
  if (ageYears !== null && ageYears !== undefined && ageYears < CHILD_UNDER_YEARS && (p.lowC !== undefined || p.highC !== undefined)) return { low: p.lowC, high: p.highC };
  const female = sex === 'F' && (p.lowF !== undefined || p.highF !== undefined);
  return female ? { low: p.lowF, high: p.highF } : { low: p.low, high: p.high };
}

/** How a number compares with the range and the critical limits. */
export function flagNumber(value: number, p: LabParameter, sex: string | null | undefined, ageYears?: number | null): Flag {
  if (p.critLow !== undefined && value < p.critLow) return 'CRITICAL_LOW';
  if (p.critHigh !== undefined && value > p.critHigh) return 'CRITICAL_HIGH';
  const { low, high } = rangeFor(p, sex, ageYears);
  if (low !== undefined && value < low) return 'LOW';
  if (high !== undefined && value > high) return 'HIGH';
  return 'NORMAL';
}

/**
 * Check what the technician entered against the test's parameters and judge each value. Only parameters the test has may be
 * entered; a blank is "not done" and is left out; at least one value is needed. The flags are worked out here, never taken
 * from the screen.
 */
export function evaluateResults(params: LabParameter[], entered: unknown, sex: string | null | undefined, ageYears?: number | null): { values: LabValue[]; hasCritical: boolean } {
  if (!entered || typeof entered !== 'object' || Array.isArray(entered)) throw new BadRequestException('Results must be a list of values by name');
  const byName = new Map(params.map((p) => [p.name, p]));
  const input = entered as Record<string, unknown>;
  for (const key of Object.keys(input)) if (!byName.has(key)) throw new BadRequestException(`"${key}" is not measured by this test`);
  const values: LabValue[] = [];
  for (const p of params) {
    const raw = input[p.name];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const base = { name: p.name, ...(p.unit ? { unit: p.unit } : {}) };
    if (p.kind === 'NUMERIC') {
      const n = numberInRange(String(raw).trim(), p.name, { min: -1_000_000, max: 1_000_000 });
      const { low, high } = rangeFor(p, sex, ageYears);
      values.push({ ...base, value: String(n), ...(low !== undefined ? { low } : {}), ...(high !== undefined ? { high } : {}), flag: flagNumber(n, p, sex, ageYears) });
    } else if (p.kind === 'CHOICE') {
      const v = String(raw).trim();
      if (!p.choices?.includes(v)) throw new BadRequestException(`${p.name}: choose one of ${p.choices?.join(', ')}`);
      values.push({ ...base, value: v, flag: p.abnormal?.includes(v) ? 'ABNORMAL' : 'NORMAL' });
    } else {
      values.push({ ...base, value: text(raw, p.name, 500), flag: null });
    }
  }
  if (values.length === 0) throw new BadRequestException('Enter at least one result');
  return { values, hasCritical: values.some((v) => v.flag === 'CRITICAL_LOW' || v.flag === 'CRITICAL_HIGH') };
}

export function parseValues(raw: unknown): LabValue[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? (v as LabValue[]) : [];
  } catch {
    return [];
  }
}

/** True when anything is outside the normal range or abnormal. */
export const isAbnormal = (values: LabValue[]) => values.some((v) => v.flag && v.flag !== 'NORMAL');

// ── the order's state ─────────────────────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUSES = ['ORDERED', 'COLLECTED', 'RESULTED', 'VERIFIED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The order's status follows its tests: all verified is VERIFIED, all entered is RESULTED, otherwise it stays collected. */
export function orderStatusFrom(current: string, itemStatuses: string[]): OrderStatus {
  if (current === 'CANCELLED') return 'CANCELLED';
  if (current === 'ORDERED') return 'ORDERED';
  if (itemStatuses.length > 0 && itemStatuses.every((s) => s === 'VERIFIED')) return 'VERIFIED';
  if (itemStatuses.length > 0 && itemStatuses.every((s) => s === 'RESULTED' || s === 'VERIFIED')) return 'RESULTED';
  return 'COLLECTED';
}

/** When an order falls due: its creation plus the longest turnaround among its tests. Null when no test says how long it takes. */
export function overdueAt(createdAt: Date, hours: Array<number | null>): Date | null {
  const longest = Math.max(0, ...hours.filter((h): h is number => typeof h === 'number' && h > 0));
  return longest > 0 ? new Date(createdAt.getTime() + longest * 3_600_000) : null;
}

/** Who may release a result: someone other than the person who entered it, except a manager or owner (a small lab, one person). */
export function canVerify(resultedById: string | null, actor: { id: string; role: string }): boolean {
  if (['OWNER', 'ADMIN', 'MANAGER'].includes(actor.role)) return true;
  return !!resultedById && resultedById !== actor.id;
}
