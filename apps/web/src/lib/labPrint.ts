/** A lab report for the patient or the file: the released results of one order, with normal ranges and flags. */
import { esc } from './visitPrint';
import { FLAG_LABEL, type LabOrder } from './lab';

const when = (d: string | null) => (d ? new Date(d).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function labReportHtml(business: string, o: LabOrder): string | null {
  const items = o.items.filter((i) => i.status === 'VERIFIED');
  if (items.length === 0 || !o.patient) return null;
  const rows = items.map((i) => `
    <h2>${esc(i.testName)}</h2>
    <table><tr><th>Test</th><th>Result</th><th>Normal range</th><th></th></tr>
    ${i.results.map((r) => `<tr class="${r.flag && r.flag !== 'NORMAL' ? 'flag' : ''}"><td>${esc(r.name)}</td><td><b>${esc(r.value)}</b> ${esc(r.unit ?? '')}</td>
      <td>${r.low !== undefined || r.high !== undefined ? esc(`${r.low ?? ''} - ${r.high ?? ''}`) : ''}</td><td>${r.flag && r.flag !== 'NORMAL' ? esc(FLAG_LABEL[r.flag]) : ''}</td></tr>`).join('')}
    </table>
    ${i.comment ? `<p class="note">Comment: ${esc(i.comment)}</p>` : ''}
    <p class="small">Entered by ${esc(i.resultedBy ?? '')}, released by ${esc(i.verifiedBy ?? '')} on ${esc(when(i.verifiedAt))}</p>`).join('');
  return `<html><head><title>Lab report ${esc(o.orderNumber)}</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:24px;max-width:700px;margin:0 auto;color:#111}
    h1{font-size:18px;margin:0} h2{font-size:14px;margin:16px 0 4px;border-bottom:1px solid #999;padding-bottom:3px}
    table{width:100%;border-collapse:collapse} td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
    .flag td{background:#fff4e5} .note{margin:6px 0} .small{color:#555;font-size:11px;margin:4px 0}
  </style></head><body>
    <h1>${esc(business)}</h1><p>Laboratory report ${esc(o.orderNumber)}</p>
    <p><b>${esc(o.patient.name)}</b> (${esc(o.patient.patientNumber)})${o.patient.ageYears != null ? `, ${o.patient.ageYears} years` : ''}${o.patient.sex ? `, ${o.patient.sex === 'F' ? 'female' : o.patient.sex === 'M' ? 'male' : 'other'}` : ''}<br/>
    Requested by ${esc(o.orderedByName)}${o.visitNumber ? ` · visit ${esc(o.visitNumber)}` : ''}${o.collectedAt ? ` · specimen collected ${esc(when(o.collectedAt))}` : ''}</p>
    ${rows}
  </body></html>`;
}

/** A small label for the specimen tube or request form: who, what, when. */
export function specimenLabelHtml(o: LabOrder): string | null {
  if (!o.patient || o.items.every((i) => i.specimen === 'NONE')) return null;
  const specimens = [...new Set(o.items.map((i) => i.specimen).filter((s) => s !== 'NONE'))].map((s) => s.toLowerCase()).join(', ');
  return `<html><head><title>Specimen label</title><style>
    @page{size:60mm 38mm;margin:2mm} body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:1mm;width:56mm}
    .n{font-size:12px;font-weight:bold} .m{font-family:monospace;font-size:11px;font-weight:bold} p{margin:1px 0}
  </style></head><body>
    <p class="n">${esc(o.patient.name)}</p>
    <p>${esc(o.patient.patientNumber)}${o.patient.ageYears != null ? ` · ${o.patient.ageYears}y` : ''}${o.patient.sex ? ` · ${esc(o.patient.sex)}` : ''}</p>
    <p class="m">${esc(o.orderNumber)}${o.priority === 'URGENT' ? ' · URGENT' : ''}</p>
    <p>${esc(o.items.map((i) => i.testName).join(', '))}</p>
    <p>${esc(specimens)} · ${esc(when(o.collectedAt ?? new Date().toISOString()))}</p>
  </body></html>`;
}
