/** The two documents a visit can produce for the patient to carry: a sick note and a referral letter. */
import type { VisitDetail } from './clinical';

export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

const SHELL = (title: string, body: string) => `<html><head><title>${esc(title)}</title><style>
  body{font-family:Georgia,serif;font-size:14px;padding:28px;max-width:640px;margin:0 auto;color:#111}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#555;font-size:12px;margin-bottom:18px}
  h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
  p{margin:6px 0;line-height:1.5} .sign{margin-top:48px;border-top:1px solid #333;width:220px;padding-top:4px;font-size:12px}
  </style></head><body>${body}</body></html>`;

const head = (business: string, visit: VisitDetail) =>
  `<h1>${esc(business)}</h1><p class="sub">Visit ${esc(visit.visitNumber)} · ${esc(fmtDate(visit.completedAt ?? visit.createdAt))}</p>`;

/** A note excusing the patient from work or school. Says nothing about the illness unless the doctor wrote a note for it. */
export function sickNoteHtml(business: string, visit: VisitDetail): string | null {
  if (!visit.sickLeaveDays || !visit.patient) return null;
  const start = new Date(visit.consultStartedAt ?? visit.createdAt);
  const end = new Date(start.getTime() + (visit.sickLeaveDays - 1) * 86_400_000);
  return SHELL('Sick note', `${head(business, visit)}
    <h2>Sick note</h2>
    <p>This is to certify that <b>${esc(visit.patient.name)}</b>${visit.patient.idNumber ? ` (ID ${esc(visit.patient.idNumber)})` : ''} was seen at this facility on ${esc(fmtDate(start))}
    and is advised to rest and be excused from duty for <b>${visit.sickLeaveDays} day${visit.sickLeaveDays === 1 ? '' : 's'}</b>, from ${esc(fmtDate(start))} to ${esc(fmtDate(end))}.</p>
    ${visit.sickLeaveNote ? `<p>${esc(visit.sickLeaveNote)}</p>` : ''}
    <div class="sign">${esc(visit.doctorName ?? '')}<br/>Attending clinician</div>`);
}

/** A letter sending the patient to another facility, with what was found. */
export function referralLetterHtml(business: string, visit: VisitDetail): string | null {
  if (!visit.referralTo || !visit.patient) return null;
  const p = visit.patient;
  const vitals = [
    visit.temperatureC != null && `Temperature ${visit.temperatureC} °C`,
    visit.pulse != null && `Pulse ${visit.pulse}`,
    visit.systolic != null && visit.diastolic != null && `BP ${visit.systolic}/${visit.diastolic}`,
    visit.spo2 != null && `SpO2 ${visit.spo2}%`,
    visit.weightKg != null && `Weight ${visit.weightKg} kg`,
  ].filter(Boolean).join(', ');
  return SHELL('Referral', `${head(business, visit)}
    <h2>Referral to ${esc(visit.referralTo)}</h2>
    <p><b>${esc(p.name)}</b>${p.ageYears != null ? `, ${p.ageYears} years` : ''}${p.sex ? `, ${p.sex === 'F' ? 'female' : p.sex === 'M' ? 'male' : 'other'}` : ''}${p.patientNumber ? ` (${esc(p.patientNumber)})` : ''}.</p>
    ${visit.complaint ? `<p><b>Complaint:</b> ${esc(visit.complaint)}</p>` : ''}
    ${vitals ? `<p><b>Vitals:</b> ${esc(vitals)}</p>` : ''}
    ${visit.diagnoses.length ? `<p><b>Diagnosis:</b> ${esc(visit.diagnoses.map((d) => (d.code ? `${d.label} (${d.code})` : d.label)).join('; '))}</p>` : ''}
    ${p.allergies.length ? `<p><b>Allergies:</b> ${esc(p.allergies.map((a) => a.substance).join(', '))}</p>` : ''}
    ${visit.referralNote ? `<p>${esc(visit.referralNote)}</p>` : ''}
    <div class="sign">${esc(visit.doctorName ?? '')}<br/>Referring clinician</div>`);
}
