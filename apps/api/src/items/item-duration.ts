/**
 * How long a service takes, in minutes, as sent by a screen. A real number between 5 minutes and 12 hours, or "not set":
 * `null` for an empty value (so an edit can clear it) and `undefined` for a value that cannot be a duration (left alone).
 */
export function cleanDuration(v: unknown): number | null | undefined {
  if (v === null || v === '') return null;
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const whole = Math.round(n);
  return whole >= 5 && whole <= 720 ? whole : undefined;
}
