import { randomBytes } from 'crypto';

/**
 * Delivery order numbers appear in the public tracking URL, /track/<orderNumber>,
 * on a page that shows the driver's position and the delivery address. The old
 * format was `DEL-${Date.now()}`, so anyone could walk nearby timestamps and watch
 * other people's deliveries. Random characters make that enumeration useless.
 *
 * Crockford-style alphabet: no I, L, O or U, so nothing is misread over the phone
 * or mistyped from a printed receipt. Eight characters is ~10^12 possibilities —
 * far beyond guessing, and shorter than the 13-digit timestamp it replaces.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newDeliveryOrderNumber(prefix = 'DEL'): string {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${out}`;
}
