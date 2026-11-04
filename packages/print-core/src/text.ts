// Byte- and text-level helpers shared by every print path (web, desktop, mobile).
//
// ESC/POS output mixes command bytes (some >= 0x80, e.g. the cash drawer pulse 0xFA)
// with receipt text. Commands are therefore emitted as raw single bytes, and every
// piece of user-entered text is reduced to printable ASCII first so that no text byte
// can be mistaken for a command.

const REPLACEMENTS: Record<string, string> = {
  '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"',
  '×': 'x', '·': '.', '•': '*', '…': '...', '€': 'EUR', ' ': ' ',
};

/** Printable-ASCII version of user text (names, notes, footers) for ESC/POS output. */
export function asciiSafe(text: string | undefined | null): string {
  if (!text) return '';
  return text
    .replace(/[–—‘’“”×·•…€ ]/g, (c) => REPLACEMENTS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?');
}

/** One byte per char (0x00-0xFF), preserving command bytes. Anything wider becomes '?'. */
export function encodeLatin1(data: string): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
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

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Split a payload for transports with a small write limit (Bluetooth LE). */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size));
  return chunks;
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

/** `left` ... `right` on one line. The amount always fits; the label gives way. */
export function row(left: string, right: string, cols: number): string {
  const maxLeft = Math.max(0, cols - right.length - 1);
  const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
  return l + ' '.repeat(Math.max(1, cols - l.length - right.length)) + right;
}

/** 1234567 -> "1,234,567". Deterministic: does not depend on the runtime's Intl data. */
export function groupThousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Cents -> "1,234.50". */
export function formatAmount(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${groupThousands(whole)}.${frac}`;
}

/** Cents -> "KES 1,234.50". */
export function formatKES(cents: number): string {
  return `KES ${formatAmount(cents)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "04/11/2026 14:05" in the device's local time. Returns the input unchanged if it is not a date. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "14:05" in the device's local time. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
