/** Shared by the clinic and pharmacy screens: the shapes the server returns and the small rules around them. */

export type Severity = 'BLOCK' | 'WARN' | 'INFO';
export type WarningKind = 'ALLERGY' | 'INTERACTION' | 'MAX_DOSE' | 'DUPLICATE' | 'PREGNANCY' | 'NO_PATIENT';

export interface SafetyWarning { kind: WarningKind; severity: Severity; message: string; drugs: string[] }
export interface SafetyResult { warnings: SafetyWarning[]; blocked: boolean }

export interface Allergy { substance: string; reaction?: string; severity?: string }

export interface Patient {
  id: string;
  patientNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  sex: string | null;
  idNumber: string | null;
  address: string | null;
  allergies: Allergy[];
  conditions: string[];
  weightKg: number | null;
  pregnant: boolean;
  breastfeeding: boolean;
  bloodGroup: string | null;
  nextOfKinName: string | null;
  nextOfKinPhone: string | null;
  insuranceProviderId: string | null;
  insuranceMemberNumber: string | null;
  notes: string | null;
  isActive: boolean;
}

/** Who may set a safety warning aside, or approve a sale without a prescription, with their own login: an owner, a manager or a pharmacist. */
export const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'PHARMACIST'];
/** An approver can set a warning aside with their own login; anyone else needs one of them to type a PIN. */
export const canApproveAlone = (role?: string) => MANAGER_ROLES.includes(String(role));

/** Frequencies as the server stores them. */
export const FREQUENCIES: Array<{ value: string; label: string }> = [
  { value: 'OD', label: 'OD: once a day' },
  { value: 'BD', label: 'BD: twice a day' },
  { value: 'TDS', label: 'TDS: three times a day' },
  { value: 'QDS', label: 'QDS: four times a day' },
  { value: 'Q4H', label: 'Every 4 hours' },
  { value: 'Q6H', label: 'Every 6 hours' },
  { value: 'Q8H', label: 'Every 8 hours' },
  { value: 'Q12H', label: 'Every 12 hours' },
  { value: 'MANE', label: 'Morning only' },
  { value: 'NOCTE', label: 'At night' },
  { value: 'WEEKLY', label: 'Once a week' },
  { value: 'PRN', label: 'PRN: when needed' },
  { value: 'STAT', label: 'STAT: once, now' },
];

/** Other spellings the server also reads. Old prescriptions on file may carry these. */
const FREQUENCY_ALIASES: Record<string, string> = { QID: 'QDS', ON: 'NOCTE', OM: 'MANE' };
export const frequencyLabel = (code?: string) => {
  const c = FREQUENCY_ALIASES[String(code ?? '').toUpperCase()] ?? String(code ?? '').toUpperCase();
  return FREQUENCIES.find((f) => f.value === c)?.label.split(':')[0] ?? c;
};

export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'mg', 'g', 'mcg', 'sachet', 'drop', 'puff', 'patch', 'injection', 'unit'];

/** Allergies as a short line for a banner: "Penicillin (rash), Sulfa". */
export const allergyLine = (list: Allergy[]) => list.map((a) => (a.reaction ? `${a.substance} (${a.reaction})` : a.substance)).join(', ');

/** Does an override the person typed have everything the server will ask for? */
export function overrideReady(o: { reason: string; pin: string }, role?: string) {
  return o.reason.trim().length >= 5 && (canApproveAlone(role) || o.pin.trim().length >= 4);
}

/** What goes in the request body. A manager's own login needs no PIN. */
export function overridePayload(o: { reason: string; pin: string }, role?: string) {
  return { reason: o.reason.trim(), ...(canApproveAlone(role) || !o.pin.trim() ? {} : { managerPin: o.pin.trim() }) };
}

/** A medicine the till may not sell without a prescription: marked as needing one, or on a controlled schedule. */
export function isRestrictedItem(item: { requiresPrescription?: boolean | null; scheduleClass?: string | null }): boolean {
  return item.requiresPrescription === true || ['II', 'III', 'IV', 'V'].includes(String(item.scheduleClass ?? '').toUpperCase());
}

export const isControlledSchedule = (s?: string | null) => ['II', 'III', 'IV', 'V'].includes(String(s ?? '').toUpperCase());

/** "Dr. Mwangi" whether the name was typed with the title or without it. */
export const doctorLabel = (name: string) => (/^dr\.?(\s|$)/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`);

// ── Visits ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type VisitStatus = 'WAITING' | 'TRIAGED' | 'IN_CONSULTATION' | 'READY_TO_BILL' | 'COMPLETED' | 'CANCELLED';
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  WAITING: 'Waiting',
  TRIAGED: 'Triaged',
  IN_CONSULTATION: 'With the doctor',
  READY_TO_BILL: 'To bill',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
export const OPEN_VISIT_STATUSES: VisitStatus[] = ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'];

/** `code` is ICD-10; `icd11` is the ICD-11 code that SHA claims ask for. */
export interface Diagnosis { code?: string; icd11?: string; label: string }

export interface PatientCard {
  id: string; name: string; patientNumber: string; phone: string | null; sex: string | null; ageYears: number | null;
  allergies: Allergy[]; conditions: string[]; pregnant: boolean; weightKg: number | null;
}

export interface VisitRow {
  id: string; visitNumber: string; status: VisitStatus; priority: 'NORMAL' | 'URGENT'; complaint: string | null;
  doctorId: string | null; doctorName: string | null; createdAt: string; patientId: string; patient: PatientCard | null;
}

export interface VisitCharge { id: string; itemId: string; name: string; quantity: number; unitPriceCents: number; totalCents: number }

export interface VisitDetail extends Omit<VisitRow, 'patient'> {
  invoicing: boolean;
  storeId: string;
  patient: (Patient & { ageYears: number | null }) | null;
  temperatureC: number | null; pulse: number | null; respiratoryRate: number | null; systolic: number | null; diastolic: number | null;
  spo2: number | null; weightKg: number | null; heightCm: number | null; bloodSugarMmol: number | null; painScore: number | null;
  triageNotes: string | null; triagedBy: string | null; consultStartedAt: string | null;
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null;
  diagnoses: Diagnosis[];
  sickLeaveDays: number | null; sickLeaveNote: string | null; referralTo: string | null; referralNote: string | null; followUpDate: string | null;
  saleId: string | null; cancelReason: string | null; completedAt: string | null;
  charges: VisitCharge[]; totalCents: number;
  prescriptions: Array<{ id: string; prescriptionNumber: string; status: string; items: string }>;
}

export interface VitalFlag { field: string; text: string; level: 'WARN' | 'ALERT' }

/**
 * What is outside the usual adult range, to catch the eye at triage. Adult ranges only (a child's normal pulse and breathing
 * differ, so nothing is flagged under 12), and a flag is a prompt for the clinician, never a diagnosis.
 */
export function vitalFlags(v: Partial<Record<string, number | null>>, ageYears: number | null): VitalFlag[] {
  if (ageYears !== null && ageYears < 12) return [];
  const out: VitalFlag[] = [];
  const has = (n: number | null | undefined): n is number => typeof n === 'number';
  if (has(v.temperatureC)) {
    if (v.temperatureC >= 39.5) out.push({ field: 'temperatureC', text: `High fever ${v.temperatureC} °C`, level: 'ALERT' });
    else if (v.temperatureC >= 37.8) out.push({ field: 'temperatureC', text: `Fever ${v.temperatureC} °C`, level: 'WARN' });
    else if (v.temperatureC < 35.5) out.push({ field: 'temperatureC', text: `Low temperature ${v.temperatureC} °C`, level: 'ALERT' });
  }
  if (has(v.pulse)) {
    if (v.pulse > 120 || v.pulse < 50) out.push({ field: 'pulse', text: `Pulse ${v.pulse}`, level: 'ALERT' });
    else if (v.pulse > 100) out.push({ field: 'pulse', text: `Fast pulse ${v.pulse}`, level: 'WARN' });
  }
  if (has(v.respiratoryRate)) {
    if (v.respiratoryRate > 30 || v.respiratoryRate < 8) out.push({ field: 'respiratoryRate', text: `Breathing rate ${v.respiratoryRate}`, level: 'ALERT' });
    else if (v.respiratoryRate > 20) out.push({ field: 'respiratoryRate', text: `Fast breathing ${v.respiratoryRate}`, level: 'WARN' });
  }
  if (has(v.spo2)) {
    if (v.spo2 < 90) out.push({ field: 'spo2', text: `Oxygen saturation ${v.spo2}%`, level: 'ALERT' });
    else if (v.spo2 < 95) out.push({ field: 'spo2', text: `Low oxygen saturation ${v.spo2}%`, level: 'WARN' });
  }
  if (has(v.systolic) && has(v.diastolic)) {
    if (v.systolic >= 180 || v.diastolic >= 120) out.push({ field: 'bp', text: `Blood pressure ${v.systolic}/${v.diastolic}`, level: 'ALERT' });
    else if (v.systolic >= 140 || v.diastolic >= 90) out.push({ field: 'bp', text: `High blood pressure ${v.systolic}/${v.diastolic}`, level: 'WARN' });
    else if (v.systolic < 90 || v.diastolic < 60) out.push({ field: 'bp', text: `Low blood pressure ${v.systolic}/${v.diastolic}`, level: 'WARN' });
  }
  if (has(v.bloodSugarMmol)) {
    if (v.bloodSugarMmol < 3.5 || v.bloodSugarMmol > 20) out.push({ field: 'bloodSugarMmol', text: `Blood sugar ${v.bloodSugarMmol} mmol/L`, level: 'ALERT' });
    else if (v.bloodSugarMmol > 11.1) out.push({ field: 'bloodSugarMmol', text: `High blood sugar ${v.bloodSugarMmol} mmol/L`, level: 'WARN' });
  }
  return out;
}

/** Body mass index, or null when height or weight is missing. */
export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/** How long a visit has been open, as "12 min" or "1 h 5 min". */
export function waitLabel(createdAt: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}
