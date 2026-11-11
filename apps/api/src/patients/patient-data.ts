import { BadRequestException } from '@nestjs/common';
import { numberInRange, oneOf, optionalText, text } from '../common/validate';
import { parseAllergies, parseStringList, type Allergy } from '../prescriptions/clinical-safety';

export const SEXES = ['F', 'M', 'O'] as const;
export const ALLERGY_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const MAX_ALLERGIES = 40;
const MAX_CONDITIONS = 40;

export interface PatientInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  sex?: string | null;
  idNumber?: string | null;
  address?: string | null;
  allergies?: unknown;
  conditions?: unknown;
  weightKg?: number | null;
  pregnant?: boolean;
  breastfeeding?: boolean;
  bloodGroup?: string | null;
  nextOfKinName?: string | null;
  nextOfKinPhone?: string | null;
  insuranceProviderId?: string | null;
  insuranceMemberNumber?: string | null;
  notes?: string | null;
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

/** A birth date typed as 2026-01-31 (or a full ISO date): a real day, not in the future, not more than 130 years ago. */
export function parseBirthDate(value: unknown, now = new Date()): Date {
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) throw new BadRequestException('Date of birth must look like 1990-04-23');
  const d = new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s.slice(0, 10)) throw new BadRequestException('Date of birth is not a real date');
  if (d.getTime() > now.getTime()) throw new BadRequestException('Date of birth cannot be in the future');
  if (now.getUTCFullYear() - d.getUTCFullYear() > 130) throw new BadRequestException('Date of birth is more than 130 years ago');
  return d;
}

/** Whole years old on `now`, or null when the birth date is unknown. */
export function ageYears(dob: Date | null | undefined, now = new Date()): number | null {
  if (!dob) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const before = now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (before) age -= 1;
  return age;
}

export function cleanAllergies(value: unknown): Allergy[] {
  if (!Array.isArray(value)) throw new BadRequestException('Allergies must be a list');
  if (value.length > MAX_ALLERGIES) throw new BadRequestException(`At most ${MAX_ALLERGIES} allergies`);
  const seen = new Set<string>();
  const out: Allergy[] = [];
  for (const raw of value) {
    const a = typeof raw === 'string' ? { substance: raw } : (raw as Allergy);
    const substance = text(a?.substance, 'Allergy', 80);
    const key = substance.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const reaction = optionalText(a?.reaction, 'Reaction', 120);
    const severity = blank(a?.severity) ? undefined : oneOf(String(a.severity).toUpperCase(), 'Allergy severity', ALLERGY_SEVERITIES);
    out.push({ substance, ...(reaction ? { reaction } : {}), ...(severity ? { severity } : {}) });
  }
  return out;
}

export function cleanConditions(value: unknown): string[] {
  if (!Array.isArray(value)) throw new BadRequestException('Conditions must be a list');
  if (value.length > MAX_CONDITIONS) throw new BadRequestException(`At most ${MAX_CONDITIONS} conditions`);
  return [...new Set(value.map((c) => text(c, 'Condition', 80)))];
}

/**
 * The columns to write for what the screen sent. Only what was sent is touched (an update that omits a field leaves it),
 * and `null` or blank clears an optional one. Nothing here is trusted: the business and the id are the caller's.
 */
export function patientData(input: PatientInput, creating: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (creating || input.name !== undefined) data.name = text(input.name, 'Patient name', 120);
  const opt = (field: keyof PatientInput, label: string, max: number) => {
    if (input[field] === undefined) return;
    data[field] = blank(input[field]) ? null : text(input[field], label, max);
  };
  opt('phone', 'Phone', 30);
  opt('email', 'Email', 120);
  opt('idNumber', 'ID number', 30);
  opt('address', 'Address', 200);
  opt('nextOfKinName', 'Next of kin', 120);
  opt('nextOfKinPhone', 'Next of kin phone', 30);
  opt('insuranceProviderId', 'Insurer', 64);
  opt('insuranceMemberNumber', 'Insurance member number', 60);
  opt('notes', 'Notes', 1000);
  if (input.dateOfBirth !== undefined) data.dateOfBirth = blank(input.dateOfBirth) ? null : parseBirthDate(input.dateOfBirth);
  if (input.sex !== undefined) data.sex = blank(input.sex) ? null : oneOf(String(input.sex).toUpperCase(), 'Sex', SEXES);
  if (input.bloodGroup !== undefined) data.bloodGroup = blank(input.bloodGroup) ? null : oneOf(String(input.bloodGroup).toUpperCase(), 'Blood group', BLOOD_GROUPS);
  if (input.weightKg !== undefined) data.weightKg = blank(input.weightKg) ? null : numberInRange(input.weightKg, 'Weight (kg)', { min: 0.3, max: 500 });
  if (input.pregnant !== undefined) data.pregnant = input.pregnant === true;
  if (input.breastfeeding !== undefined) data.breastfeeding = input.breastfeeding === true;
  if (input.allergies !== undefined) data.allergies = JSON.stringify(cleanAllergies(input.allergies));
  if (input.conditions !== undefined) data.conditions = JSON.stringify(cleanConditions(input.conditions));
  if (data.pregnant === true && data.sex === 'M') throw new BadRequestException('A male patient cannot be recorded as pregnant');
  return data;
}

/** A patient row as the screens use it: lists parsed, age worked out. */
export function presentPatient<T extends { allergies: string; conditions: string; dateOfBirth: Date | null }>(p: T) {
  return { ...p, allergies: parseAllergies(p.allergies), conditions: parseStringList(p.conditions), ageYears: ageYears(p.dateOfBirth) };
}
