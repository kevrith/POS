/** A claim laid out on one page: for filling in an insurer's portal or form by hand, or keeping with the file. */
import { formatKES } from '@pos/shared';
import { esc } from './visitPrint';
import type { ClaimDetail } from './cover';

const date = (d: string | Date) => new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

export function claimSummaryHtml(business: string, c: ClaimDetail): string {
  const lines = c.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${esc(l.quantity)}</td><td class="n">${formatKES(l.unitPriceCents)}</td><td class="n">${formatKES(l.totalCents)}</td></tr>`).join('');
  const dx = c.diagnoses.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(d.code ?? '')}</td><td>${esc(d.icd11 ?? '')}</td></tr>`).join('');
  return `<html><head><title>Claim</title><style>
    body{font-family:Arial,sans-serif;font-size:13px;padding:24px;max-width:720px;margin:0 auto;color:#111}
    h1{font-size:18px;margin:0} h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #999;padding-bottom:3px}
    table{width:100%;border-collapse:collapse} td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left} .n{text-align:right}
    .k{color:#555;width:160px} .total td{font-weight:bold;border-top:2px solid #333}
  </style></head><body>
    <h1>${esc(business)}</h1><p>Insurance claim${c.claimNumber ? ` ${esc(c.claimNumber)}` : ''} · raised ${esc(date(c.submittedAt))}</p>
    <h2>Patient and cover</h2>
    <table><tr><td class="k">Patient</td><td>${esc(c.patientName)}</td></tr>
    <tr><td class="k">Insurer</td><td>${esc(c.providerName)}</td></tr>
    <tr><td class="k">Member number</td><td>${esc(c.memberNumber ?? '')}</td></tr>
    ${c.preauthNumber ? `<tr><td class="k">Pre-authorisation</td><td>${esc(c.preauthNumber)}</td></tr>` : ''}
    <tr><td class="k">Patient pays</td><td>${esc(c.copayPct)}%</td></tr></table>
    ${c.diagnoses.length ? `<h2>Diagnoses</h2><table><tr><th>Diagnosis</th><th>ICD-10</th><th>ICD-11</th></tr>${dx}</table>` : ''}
    <h2>Services and medicines</h2>
    <table><tr><th>Item</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr>${lines}</table>
    <h2>Amount claimed</h2>
    <table><tr class="total"><td>Billed to the insurer</td><td class="n">${formatKES(c.billedCents)}</td></tr></table>
  </body></html>`;
}
