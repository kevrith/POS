/**
 * Kenyan phone numbers reach us in four shapes — `0712345678`, `712345678`,
 * `254712345678`, `+254712345678` — and every write path (POS, field sales, CSV
 * import) stores whatever the operator typed. Portal login identifies a customer
 * by phone, so it has to compare on one canonical form or it hands the same
 * person a different account depending on how they typed their own number.
 *
 * Canonical form is the bare MSISDN, `254XXXXXXXXX`. The leading `+` is a
 * presentation concern and is added only at the SMS boundary (`toE164`).
 */

/** Canonicalize a Kenyan number to `254XXXXXXXXX`, or null if it isn't one. */
export function normalizeKePhone(raw?: string | null): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('254')) return digits.length === 12 ? digits : null;
  if (digits.startsWith('0')) {
    const local = digits.slice(1);
    return local.length === 9 ? `254${local}` : null;
  }
  return digits.length === 9 ? `254${digits}` : null;
}

/**
 * Every shape a canonical number may already be stored under, so a lookup can
 * find customers created before normalization existed. Callers should rewrite
 * the row to the canonical form once matched, so each row heals exactly once.
 */
export function kePhoneVariants(canonical: string): string[] {
  const local = canonical.slice(3);
  return [canonical, `+${canonical}`, `0${local}`, local];
}

/** International format for Africa's Talking, which documents `+254…`. */
export function toE164(raw?: string | null): string | null {
  const canonical = normalizeKePhone(raw);
  if (canonical) return `+${canonical}`;
  // Not a Kenyan number we recognise — pass a caller-supplied international
  // number through rather than dropping the message.
  const trimmed = (raw ?? '').trim();
  return trimmed.startsWith('+') ? trimmed : null;
}
