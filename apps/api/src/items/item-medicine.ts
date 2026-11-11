import { BadRequestException } from '@nestjs/common';
import { oneOf } from '../common/validate';

/** What an item can be marked as on the controlled-substance schedules. Blank and OTC mean not controlled. */
export const SCHEDULE_CLASSES = ['OTC', 'II', 'III', 'IV', 'V'] as const;

/** The medicine details of an item, as a screen sends them. Every field optional. */
export interface MedicineDto {
  genericName?: string | null;
  drugClass?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  scheduleClass?: string | null;
  requiresPrescription?: boolean;
}

const LIMITS: Record<'genericName' | 'drugClass' | 'strength' | 'dosageForm', number> = { genericName: 100, drugClass: 60, strength: 40, dosageForm: 40 };

/**
 * The medicine columns to write. These are what the pharmacy runs on: the generic name and class for the allergy and
 * interaction checks, the strength for dose limits, the schedule for the controlled-drug register, and "needs a prescription"
 * for the till. Only what was sent is touched; blank clears a text field. Nothing is set for an item that is not a medicine.
 */
export function cleanMedicine(dto: MedicineDto): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ['genericName', 'drugClass', 'strength', 'dosageForm'] as const) {
    const v = dto[key];
    if (v === undefined) continue;
    if (v === null || String(v).trim() === '') { out[key] = null; continue; }
    const t = String(v).trim();
    if (t.length > LIMITS[key]) throw new BadRequestException(`${key === 'genericName' ? 'Generic name' : key === 'drugClass' ? 'Drug class' : key === 'dosageForm' ? 'Dosage form' : 'Strength'} is too long (at most ${LIMITS[key]} characters)`);
    out[key] = t;
  }
  if (dto.scheduleClass !== undefined) {
    out.scheduleClass = dto.scheduleClass === null || String(dto.scheduleClass).trim() === '' ? null : oneOf(String(dto.scheduleClass).toUpperCase(), 'Schedule', SCHEDULE_CLASSES);
  }
  if (dto.requiresPrescription !== undefined) out.requiresPrescription = dto.requiresPrescription === true;
  return out;
}
