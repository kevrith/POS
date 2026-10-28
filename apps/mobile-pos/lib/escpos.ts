/**
 * ESC/POS receipt builder for thermal printers (Bluetooth and LAN).
 *
 * Output is raw bytes, never a JS string run through UTF-8: bytes above 0x7F would
 * be split in two and corrupt commands. All text is reduced to printable ASCII
 * first, so every byte that is not a command is 0x20-0x7E.
 *
 * Layout follows the paper: a 58 mm roll fits 32 characters per line, an 80 mm roll
 * fits 48 (standard font A). Item names wrap instead of being cut off, and the
 * amount column grows to fit, so large totals are never truncated.
 */
import { kes, type PaperWidth, type PrintableReceipt } from './receiptModel';

export const PAPER_COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  alignCenter: [ESC, 0x61, 1],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  doubleHeight: [ESC, 0x21, 0x10],
  normal: [ESC, 0x21, 0x00],
  cut: [GS, 0x56, 0x41, 0x00], // feed to cutter and partial cut; ignored by printers without a cutter
};

const REPLACEMENTS: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
  '×': 'x', '·': '.', '•': '*', '…': '...', ' ': ' ',
};

/** Printable-ASCII version of user text; thermal printers have no UTF-8. */
export function asciiSafe(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/[–—‘’“”×·•… ]/g, (c) => REPLACEMENTS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
}

/** Word-wrap to `cols`, hard-breaking words longer than a line. */
export function wrapText(text: string, cols: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const rawWord of text.split(' ').filter(Boolean)) {
    let word = rawWord;
    while (word.length > cols) {
      if (current) { out.push(current); current = ''; }
      out.push(word.slice(0, cols));
      word = word.slice(cols);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= cols) current += ' ' + word;
    else { out.push(current); current = word; }
  }
  if (current) out.push(current);
  return out.length ? out : [''];
}

/** `left` ... `right` on one line. The right side always fits; the left side gives way. */
export function row(left: string, right: string, cols: number): string {
  const maxLeft = Math.max(0, cols - right.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  return l + ' '.repeat(Math.max(1, cols - l.length - right.length)) + right;
}

class Bytes {
  private data: number[] = [];
  cmd(c: number[]) { this.data.push(...c); return this; }
  text(s: string) { for (let i = 0; i < s.length; i++) this.data.push(s.charCodeAt(i) & 0xff); return this; }
  line(s = '') { return this.text(s).text('\n'); }
  done() { return Uint8Array.from(this.data); }
}

export function buildReceiptBytes(r: PrintableReceipt, paperWidth: PaperWidth): Uint8Array {
  const cols = PAPER_COLUMNS[paperWidth];
  const dash = '-'.repeat(cols);
  const b = new Bytes().cmd(CMD.init);

  b.cmd(CMD.alignCenter).cmd(CMD.boldOn).cmd(CMD.doubleHeight);
  for (const l of wrapText(asciiSafe(r.businessName), cols)) b.line(l);
  b.cmd(CMD.normal).cmd(CMD.boldOff);
  b.line(`Receipt ${asciiSafe(r.receiptNumber)}`);
  b.line(asciiSafe(new Date(r.dateISO).toLocaleString('en-KE')));
  b.cmd(CMD.alignLeft).line(dash);

  for (const item of r.lines) {
    for (const l of wrapText(asciiSafe(item.name), cols)) b.line(l);
    b.line(row(`  ${item.quantity} x ${kes(item.unitPriceCents)}`, kes(item.quantity * item.unitPriceCents), cols));
  }

  b.line(dash);
  b.line(row('Subtotal', kes(r.subtotalCents), cols));
  if (r.taxCents) b.line(row(asciiSafe(r.taxLabel ?? 'Tax'), kes(r.taxCents), cols));
  b.cmd(CMD.boldOn).cmd(CMD.doubleHeight).line(row('TOTAL', `KES ${kes(r.totalCents)}`, cols)).cmd(CMD.normal).cmd(CMD.boldOff);
  if (r.paymentMethod) b.line(`Paid by ${asciiSafe(r.paymentMethod)}`);
  if (r.changeCents) b.line(row('Change', kes(r.changeCents), cols));

  b.line(dash).cmd(CMD.alignCenter);
  for (const l of wrapText(asciiSafe(r.footer ?? 'Thank you!'), cols)) b.line(l);
  b.line().line().line().cmd(CMD.cut);
  return b.done();
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 without Buffer/btoa, which React Native does not guarantee. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}
