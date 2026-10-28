/** Receipt HTML for the OS print sheet (expo-print), sized to the chosen paper roll. */
import { escapeHtml, kes, type PaperWidth, type PrintableReceipt } from './receiptModel';

export function receiptHtml(r: PrintableReceipt, paperWidth: PaperWidth = 58): string {
  const rows = r.lines
    .map(
      (l) => `
      <tr>
        <td class="n">${escapeHtml(l.name)}<br/><span class="q">${l.quantity} x ${kes(l.unitPriceCents)}</span></td>
        <td class="a">${kes(l.quantity * l.unitPriceCents)}</td>
      </tr>`,
    )
    .join('');

  const date = new Date(r.dateISO).toLocaleString('en-KE');
  const large = paperWidth === 80;

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { margin: 0; }
    * { box-sizing: border-box; }
    body { width: ${paperWidth}mm; margin: 0 auto; padding: 6px 8px; font-family: -apple-system, Roboto, monospace; color: #000; }
    .center { text-align: center; }
    h1 { font-size: ${large ? 16 : 14}px; margin: 4px 0; }
    .muted { color: #444; font-size: ${large ? 11 : 10}px; }
    table { width: 100%; border-collapse: collapse; font-size: ${large ? 13 : 11}px; margin-top: 6px; }
    td { padding: 2px 0; vertical-align: top; }
    td.a { text-align: right; white-space: nowrap; padding-left: 6px; }
    .q { color: #555; font-size: ${large ? 11 : 9}px; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .totline { display: flex; justify-content: space-between; font-size: ${large ? 13 : 11}px; }
    .grand { font-size: ${large ? 16 : 14}px; font-weight: 700; }
    .foot { text-align: center; font-size: ${large ? 12 : 10}px; margin-top: 8px; }
  </style></head><body>
    <div class="center">
      <h1>${escapeHtml(r.businessName)}</h1>
      <div class="muted">Receipt ${escapeHtml(r.receiptNumber)}</div>
      <div class="muted">${escapeHtml(date)}</div>
    </div>
    <table>${rows}</table>
    <div class="sep"></div>
    <div class="totline"><span>Subtotal</span><span>${kes(r.subtotalCents)}</span></div>
    ${r.taxCents ? `<div class="totline"><span>${escapeHtml(r.taxLabel ?? 'Tax')}</span><span>${kes(r.taxCents)}</span></div>` : ''}
    <div class="totline grand"><span>TOTAL</span><span>KES ${kes(r.totalCents)}</span></div>
    ${r.paymentMethod ? `<div class="totline"><span>Paid (${escapeHtml(r.paymentMethod)})</span><span></span></div>` : ''}
    ${r.changeCents ? `<div class="totline"><span>Change</span><span>${kes(r.changeCents)}</span></div>` : ''}
    <div class="foot">${escapeHtml(r.footer ?? 'Thank you!')}</div>
  </body></html>`;
}
