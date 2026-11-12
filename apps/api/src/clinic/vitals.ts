import { BadRequestException } from '@nestjs/common';
import { intInRange, numberInRange, optionalText } from '../common/validate';

/** What triage records. Every field is optional: a nurse takes what the patient needs. */
export interface VitalsInput {
  temperatureC?: number | string | null;
  pulse?: number | string | null;
  respiratoryRate?: number | string | null;
  systolic?: number | string | null;
  diastolic?: number | string | null;
  spo2?: number | string | null;
  weightKg?: number | string | null;
  heightCm?: number | string | null;
  bloodSugarMmol?: number | string | null;
  painScore?: number | string | null;
  triageNotes?: string | null;
}

const blank = (v: unknown) => v === undefined || v === null || v === '';

/**
 * The columns to write for the vitals a screen sent. Ranges are wide enough for any living patient and tight enough to catch a
 * slipped decimal (a temperature of 370, a weight of 0.65). Only what was sent is touched; blank clears a reading. A blood
 * pressure needs both numbers, with the top one higher.
 */
export function vitalsData(input: VitalsInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const num = (key: 'temperatureC' | 'weightKg' | 'heightCm' | 'bloodSugarMmol', label: string, min: number, max: number) => {
    if (input[key] === undefined) return;
    out[key] = blank(input[key]) ? null : numberInRange(input[key], label, { min, max });
  };
  const whole = (key: 'pulse' | 'respiratoryRate' | 'systolic' | 'diastolic' | 'spo2' | 'painScore', label: string, min: number, max: number) => {
    if (input[key] === undefined) return;
    out[key] = blank(input[key]) ? null : intInRange(typeof input[key] === 'string' ? Number(input[key]) : input[key], label, min, max);
  };
  num('temperatureC', 'Temperature (°C)', 30, 45);
  num('weightKg', 'Weight (kg)', 0.3, 500);
  num('heightCm', 'Height (cm)', 20, 250);
  num('bloodSugarMmol', 'Blood sugar (mmol/L)', 1, 60);
  whole('pulse', 'Pulse (beats a minute)', 20, 250);
  whole('respiratoryRate', 'Breathing rate (a minute)', 4, 80);
  whole('systolic', 'Blood pressure, top number', 50, 300);
  whole('diastolic', 'Blood pressure, bottom number', 20, 200);
  whole('spo2', 'Oxygen saturation (%)', 50, 100);
  whole('painScore', 'Pain score', 0, 10);
  if (input.triageNotes !== undefined) out.triageNotes = blank(input.triageNotes) ? null : optionalText(input.triageNotes, 'Triage notes', 1000) ?? null;

  // A pressure is two numbers: sent together, cleared together, the top one higher.
  if ((input.systolic !== undefined) !== (input.diastolic !== undefined)) throw new BadRequestException('Blood pressure needs both numbers');
  const sys = out.systolic;
  const dia = out.diastolic;
  if ((sys == null) !== (dia == null)) throw new BadRequestException('Blood pressure needs both numbers');
  if (typeof sys === 'number' && typeof dia === 'number' && sys <= dia) throw new BadRequestException('The top blood pressure number must be higher than the bottom one');
  return out;
}

export const hasAnyVital = (data: Record<string, unknown>) =>
  ['temperatureC', 'pulse', 'respiratoryRate', 'systolic', 'diastolic', 'spo2', 'weightKg', 'heightCm', 'bloodSugarMmol', 'painScore'].some((k) => typeof data[k] === 'number');
