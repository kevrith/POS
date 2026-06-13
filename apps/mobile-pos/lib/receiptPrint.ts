/**
 * Optional receipt printing for the mobile cashier app.
 *
 * Printing is OFF by default — most mobile / field selling has no printer and
 * relies on digital receipts (the API auto-sends an SMS/WhatsApp receipt when
 * the sale has a customer). When the cashier DOES have a printer, they switch
 * it on in Settings and a "Print Receipt" button appears on the success screen.
 *
 * Transport is the OS print sheet (expo-print): on Android it can target a
 * Bluetooth/Wi-Fi printer paired at the system level, or save/share a PDF.
 * (Direct silent ESC/POS over Bluetooth would need a native module + on-device
 * testing per printer model — a future enhancement.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';

const KEY = 'mobile-receipt-print-enabled';

export async function isPrintingEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function setPrintingEnabled(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(KEY, on ? 'true' : 'false'); } catch { /* ignore */ }
}

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PrintableReceipt {
  businessName: string;
  receiptNumber: string;
  dateISO: string;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxLabel?: string;
  taxCents?: number;
  totalCents: number;
  paymentMethod?: string;
  changeCents?: number;
  footer?: string;
}

function kes(cents: number): string {
  return (cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 58mm-friendly receipt HTML for expo-print. */
function receiptHtml(r: PrintableReceipt): string {
  const rows = r.lines
    .map(
      (l) => `
      <tr>
        <td class="n">${escapeHtml(l.name)}<br/><span class="q">${l.quantity} × ${kes(l.unitPriceCents)}</span></td>
        <td class="a">${kes(l.quantity * l.unitPriceCents)}</td>
      </tr>`,
    )
    .join('');

  const date = new Date(r.dateISO).toLocaleString('en-KE');

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { margin: 0; }
    * { box-sizing: border-box; }
    body { width: 58mm; margin: 0 auto; padding: 6px 8px; font-family: -apple-system, Roboto, monospace; color: #000; }
    .center { text-align: center; }
    h1 { font-size: 14px; margin: 4px 0; }
    .muted { color: #444; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
    td { padding: 2px 0; vertical-align: top; }
    td.a { text-align: right; white-space: nowrap; padding-left: 6px; }
    .q { color: #555; font-size: 9px; }
    .sep { border-top: 1px dashed #000; margin: 6px 0; }
    .totline { display: flex; justify-content: space-between; font-size: 11px; }
    .grand { font-size: 14px; font-weight: 700; }
    .foot { text-align: center; font-size: 10px; margin-top: 8px; }
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Open the OS print sheet for this receipt. Throws if the user cancels/printing fails. */
export async function printReceipt(r: PrintableReceipt): Promise<void> {
  await Print.printAsync({ html: receiptHtml(r) });
}
