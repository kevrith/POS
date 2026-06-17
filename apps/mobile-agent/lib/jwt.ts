// Pure JWT helpers (no expo/native imports) so they're unit-testable.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 decode — React Native has no reliable global atob. */
export function decodeB64(input: string): string {
  const str = input.replace(/=+$/, '');
  let output = '';
  for (let bc = 0, bs = 0, buffer, i = 0; (buffer = str.charAt(i++)); ) {
    const idx = B64.indexOf(buffer);
    if (idx === -1) continue;
    bs = bc % 4 ? bs * 64 + idx : idx;
    if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return output;
}

/** Seconds until a JWT expires. Negative = already expired, null = unknown/malformed. */
export function secondsUntilExpiry(token: string, nowMs: number = Date.now()): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = decodeB64(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp - Math.floor(nowMs / 1000) : null;
  } catch {
    return null;
  }
}
