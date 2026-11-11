import { BadRequestException } from '@nestjs/common';
import { numberInRange, oneOf, optionalText, text } from '../common/validate';

export const DOSAGE_FORMS = ['TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'INJECTION', 'CREAM', 'OINTMENT', 'DROPS', 'INHALER', 'SUPPOSITORY', 'SACHET', 'PATCH', 'OTHER'] as const;
export const DRUG_SCHEDULES = ['OTC', 'II', 'III', 'IV', 'V'] as const;
export const DOSE_LIMIT_UNITS = ['mg', 'g', 'mcg'] as const;

export interface DrugInput {
  genericName?: string;
  brandName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  category?: string | null;
  scheduleClass?: string | null;
  defaultInstructions?: string | null;
  /** The usual adult maximum in a day, in `unit`. Dispensing above it needs a manager. */
  maxDailyDose?: number | string | null;
  unit?: string | null;
  contraindicationsText?: string | null;
  notes?: string | null;
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

/**
 * The columns to write for a drug as a screen sent it. Only what was sent is touched; blank clears an optional field. The
 * business and id are never taken from the body.
 */
export function drugData(input: DrugInput, creating: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (creating || input.genericName !== undefined) out.genericName = text(input.genericName, 'Generic name', 100);
  const opt = (key: 'brandName' | 'strength' | 'defaultInstructions' | 'contraindicationsText' | 'notes', label: string, max: number) => {
    if (input[key] === undefined) return;
    out[key] = blank(input[key]) ? null : optionalText(input[key], label, max) ?? null;
  };
  opt('brandName', 'Brand name', 100);
  opt('strength', 'Strength', 40);
  opt('defaultInstructions', 'Instructions', 300);
  opt('contraindicationsText', 'Cautions', 500);
  opt('notes', 'Notes', 500);
  if (input.dosageForm !== undefined) out.dosageForm = blank(input.dosageForm) ? 'OTHER' : oneOf(String(input.dosageForm).toUpperCase(), 'Dosage form', DOSAGE_FORMS);
  if (input.category !== undefined) out.category = blank(input.category) ? 'OTHER' : text(String(input.category).toUpperCase(), 'Category', 40);
  if (input.scheduleClass !== undefined) out.scheduleClass = blank(input.scheduleClass) ? 'OTC' : oneOf(String(input.scheduleClass).toUpperCase(), 'Schedule', DRUG_SCHEDULES);
  if (input.maxDailyDose !== undefined) {
    out.maxDailyDose = blank(input.maxDailyDose) ? null : numberInRange(input.maxDailyDose, 'Maximum daily dose', { min: 0, max: 1_000_000, exclusiveMin: true });
  }
  if (input.unit !== undefined) out.unit = blank(input.unit) ? 'mg' : oneOf(String(input.unit).toLowerCase(), 'Dose unit', DOSE_LIMIT_UNITS);
  if (out.maxDailyDose != null && out.unit === undefined && creating) out.unit = 'mg';
  if (Object.keys(out).length === 0) throw new BadRequestException('Nothing to change');
  return out;
}
