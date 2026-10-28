// Byte-level helpers shared by every raw ESC/POS transport (USB, Bluetooth, LAN).
//
// ESC/POS strings in printer.ts mix command bytes (some >= 0x80, e.g. the cash
// drawer pulse 0xFA or a QR length byte) with receipt text. TextEncoder emits
// UTF-8, which turns every byte >= 0x80 into two bytes and corrupts the command.
// Commands are therefore sent as raw single bytes, and any user-entered text is
// reduced to printable ASCII first so no text byte can be mistaken for one.

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
export function encodeEscPos(data: string): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
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
