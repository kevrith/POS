import { formatKES } from '@pos/shared';
import { toCsv } from './csv';
import { esc } from './visitPrint';

/** The registers the API sends for a period, and how each is written to CSV and to paper. */

export interface ControlledEntry {
  date: string; itemName: string; scheduleClass: string; quantity: number; unit: string; patientName: string; patientIdNumber: string | null;
  prescriberName: string; prescriberLicense: string | null; dispensedBy: string; prescriptionNumber: string | null; notes: string | null;
}
export interface ControlledSummaryRow { itemName: string; scheduleClass: string | null; entries: number; dispensed: number; onHand: number | null }
export interface ControlledRegister { period: { from: string; to: string }; truncated: boolean; entries: ControlledEntry[]; summary: ControlledSummaryRow[] }

export interface DispensingEntry { date: string; prescriptionNumber: string; patientName: string; patientIdNumber: string | null; prescriberName: string; prescriberLicense: string | null; medicines: string; fills: number; dispensedBy: string | null }
export interface DispensingRegister { period: { from: string; to: string }; truncated: boolean; entries: DispensingEntry[] }

export interface DisposalEntry { date: string; itemName: string; scheduleClass: string | null; quantity: number; costCents: number; reason: string; notes: string | null; submittedBy: string; authorizedBy: string | null }
export interface DisposalRegister { period: { from: string; to: string }; truncated: boolean; totalCostCents: number; entries: DisposalEntry[] }

export const day = (iso: string): string => new Date(iso).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' });
const time = (iso: string): string => new Date(iso).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });

export const controlledCsv = (r: ControlledRegister): string => toCsv([
  ['Date', 'Time', 'Medicine', 'Schedule', 'Quantity', 'Unit', 'Patient', 'Patient ID', 'Prescriber', 'Licence', 'Prescription', 'Dispensed by', 'Notes'],
  ...r.entries.map((e) => [day(e.date), time(e.date), e.itemName, e.scheduleClass, e.quantity, e.unit, e.patientName, e.patientIdNumber, e.prescriberName, e.prescriberLicense, e.prescriptionNumber, e.dispensedBy, e.notes]),
]);

export const dispensingCsv = (r: DispensingRegister): string => toCsv([
  ['Date', 'Prescription', 'Patient', 'Patient ID', 'Prescriber', 'Licence', 'Medicines', 'Fills', 'Dispensed by'],
  ...r.entries.map((e) => [day(e.date), e.prescriptionNumber, e.patientName, e.patientIdNumber, e.prescriberName, e.prescriberLicense, e.medicines, e.fills, e.dispensedBy]),
]);

export const disposalCsv = (r: DisposalRegister): string => toCsv([
  ['Date', 'Item', 'Schedule', 'Quantity', 'Cost (KES)', 'Reason', 'Notes', 'Recorded by', 'Authorised by'],
  ...r.entries.map((e) => [day(e.date), e.itemName, e.scheduleClass, e.quantity, (e.costCents / 100).toFixed(2), e.reason, e.notes, e.submittedBy, e.authorizedBy]),
]);

const SHELL = (title: string, business: string, period: { from: string; to: string }, body: string) => `<html><head><title>${esc(title)}</title><style>
  body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#111} h1{font-size:16px;margin:0} h2{font-size:13px;margin:14px 0 4px}
  table{width:100%;border-collapse:collapse} td,th{padding:3px 5px;border:1px solid #bbb;text-align:left;vertical-align:top} th{background:#f0f0f0}
  .n{text-align:right} .sub{color:#555;margin:2px 0 10px} .sign{margin-top:36px;display:flex;gap:60px} .sign div{border-top:1px solid #333;padding-top:3px;width:200px}
  </style></head><body><h1>${esc(business)}</h1><p class="sub">${esc(title)} · ${esc(period.from)} to ${esc(period.to)}</p>${body}
  <div class="sign"><div>Pharmacist in charge</div><div>Date</div></div></body></html>`;

export function controlledHtml(business: string, r: ControlledRegister): string {
  const sum = r.summary.map((s) => `<tr><td>${esc(s.itemName)}</td><td>${esc(s.scheduleClass ?? '')}</td><td class="n">${s.entries}</td><td class="n">${s.dispensed}</td><td class="n">${s.onHand === null ? '' : s.onHand}</td></tr>`).join('');
  const rows = r.entries.map((e) => `<tr><td>${esc(day(e.date))} ${esc(time(e.date))}</td><td>${esc(e.itemName)} (${esc(e.scheduleClass)})</td><td class="n">${e.quantity} ${esc(e.unit)}</td><td>${esc(e.patientName)}${e.patientIdNumber ? `<br/>ID ${esc(e.patientIdNumber)}` : ''}</td><td>${esc(e.prescriberName)}${e.prescriberLicense ? `<br/>${esc(e.prescriberLicense)}` : ''}</td><td>${esc(e.prescriptionNumber ?? '')}</td><td>${esc(e.dispensedBy)}</td></tr>`).join('');
  return SHELL('Controlled drugs register', business, r.period, `<h2>Totals</h2><table><tr><th>Medicine</th><th>Schedule</th><th>Entries</th><th>Dispensed</th><th>Stock now</th></tr>${sum}</table>
    <h2>Entries</h2><table><tr><th>Date</th><th>Medicine</th><th>Quantity</th><th>Patient</th><th>Prescriber</th><th>Rx</th><th>Dispensed by</th></tr>${rows}</table>`);
}

export function dispensingHtml(business: string, r: DispensingRegister): string {
  const rows = r.entries.map((e) => `<tr><td>${esc(day(e.date))}</td><td>${esc(e.prescriptionNumber)}</td><td>${esc(e.patientName)}</td><td>${esc(e.prescriberName)}${e.prescriberLicense ? `<br/>${esc(e.prescriberLicense)}` : ''}</td><td>${esc(e.medicines)}</td><td class="n">${e.fills}</td><td>${esc(e.dispensedBy ?? '')}</td></tr>`).join('');
  return SHELL('Dispensing register', business, r.period, `<table><tr><th>Date</th><th>Rx</th><th>Patient</th><th>Prescriber</th><th>Medicines</th><th>Fills</th><th>Dispensed by</th></tr>${rows}</table>`);
}

export function disposalHtml(business: string, r: DisposalRegister): string {
  const rows = r.entries.map((e) => `<tr><td>${esc(day(e.date))}</td><td>${esc(e.itemName)}</td><td class="n">${e.quantity}</td><td class="n">${esc(formatKES(e.costCents))}</td><td>${esc(e.reason)}</td><td>${esc(e.notes ?? '')}</td><td>${esc(e.submittedBy)}</td><td>${esc(e.authorizedBy ?? '')}</td></tr>`).join('');
  return SHELL('Disposal of expired and damaged stock', business, r.period, `<table><tr><th>Date</th><th>Item</th><th>Qty</th><th>Cost</th><th>Reason</th><th>Notes (lot)</th><th>Recorded by</th><th>Authorised by</th></tr>${rows}</table><p>Total written off at cost: <b>${esc(formatKES(r.totalCostCents))}</b></p>`);
}

// ── a patient's data, for an access request ───────────────────────────────────────────────────────────────────────

export interface PatientBundle {
  exportedAt: string; exportedBy: string;
  patient: { name: string; patientNumber: string; phone: string | null; email: string | null; dateOfBirth: string | null; sex: string | null; idNumber: string | null; allergies: Array<{ substance: string; reaction?: string }>; conditions: string[]; notes: string | null };
  visits: Array<{ visitNumber: string; createdAt: string; complaint: string | null; doctorName: string | null; status: string; diagnoses: Array<{ label: string; code?: string }>; plan: string | null }>;
  prescriptions: Array<{ prescriptionNumber: string; createdAt: string; doctorName: string; status: string; items: Array<{ name: string; qty?: number }> }>;
  labOrders: Array<{ orderNumber: string; createdAt: string; items: Array<{ testName: string; status: string; results: Array<{ name: string; value: string; unit?: string; flag: string | null }> }> }>;
  coverChecks: unknown[];
  claims: unknown[];
}

/** A readable copy of what was found, to hand to the patient alongside the full data file. */
export function patientBundleHtml(business: string, b: PatientBundle): string {
  const p = b.patient;
  const visits = b.visits.map((v) => `<tr><td>${esc(day(v.createdAt))}</td><td>${esc(v.visitNumber)}</td><td>${esc(v.complaint ?? '')}</td><td>${esc(v.diagnoses.map((d) => d.label).join('; '))}</td><td>${esc(v.doctorName ?? '')}</td></tr>`).join('');
  const rx = b.prescriptions.map((r) => `<tr><td>${esc(day(r.createdAt))}</td><td>${esc(r.prescriptionNumber)}</td><td>${esc(r.items.map((i) => i.name).join('; '))}</td><td>${esc(r.doctorName)}</td><td>${esc(r.status)}</td></tr>`).join('');
  const lab = b.labOrders.flatMap((o) => o.items.filter((i) => i.status === 'VERIFIED').map((i) => `<tr><td>${esc(day(o.createdAt))}</td><td>${esc(i.testName)}</td><td>${esc(i.results.map((r) => `${r.name} ${r.value}${r.unit ? ` ${r.unit}` : ''}${r.flag && r.flag !== 'NORMAL' ? ` (${r.flag.toLowerCase().replace(/_/g, ' ')})` : ''}`).join('; '))}</td></tr>`)).join('');
  return `<html><head><title>Patient record</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;padding:24px;max-width:760px;margin:0 auto;color:#111} h1{font-size:18px;margin:0} h2{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #999}
    table{width:100%;border-collapse:collapse} td,th{padding:3px 5px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top} .sub{color:#555}
  </style></head><body><h1>${esc(business)}</h1><p class="sub">Copy of the record held for ${esc(p.name)} (${esc(p.patientNumber)}) · prepared ${esc(day(b.exportedAt))} by ${esc(b.exportedBy)}</p>
  <h2>Details</h2><p>${[p.dateOfBirth && `Born ${day(p.dateOfBirth)}`, p.sex, p.idNumber && `ID ${p.idNumber}`, p.phone, p.email].filter(Boolean).map((x) => esc(x)).join(' · ')}</p>
  <p>Allergies: ${esc(p.allergies.map((a) => a.substance).join(', ') || 'none recorded')}. Conditions: ${esc(p.conditions.join(', ') || 'none recorded')}.</p>
  <h2>Visits (${b.visits.length})</h2><table><tr><th>Date</th><th>Visit</th><th>Came for</th><th>Diagnoses</th><th>Doctor</th></tr>${visits}</table>
  <h2>Prescriptions (${b.prescriptions.length})</h2><table><tr><th>Date</th><th>Number</th><th>Medicines</th><th>Prescriber</th><th>Status</th></tr>${rx}</table>
  <h2>Laboratory results</h2><table><tr><th>Date</th><th>Test</th><th>Results</th></tr>${lab}</table></body></html>`;
}
