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
