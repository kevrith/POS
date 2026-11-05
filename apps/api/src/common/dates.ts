import { BadRequestException } from '@nestjs/common';

/**
 * Kenya is UTC+3 all year (no daylight saving), so a "day" for a shop in Nairobi runs from 00:00 to 23:59:59.999
 * at +03:00. A server in UTC that reads `new Date('2026-11-05T23:59:59')` or calls `setHours(0,0,0,0)` draws the
 * day boundary three hours off: sales between midnight and 03:00 land on the wrong day.
 */
const NAIROBI_OFFSET = '+03:00';
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar day (YYYY-MM-DD) an instant falls on in Nairobi. */
export function nairobiDay(instant: Date): string {
  return instant.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
}

export function nairobiDayStart(day: string): Date {
  return new Date(`${day}T00:00:00.000${NAIROBI_OFFSET}`);
}

export function nairobiDayEnd(day: string): Date {
  return new Date(`${day}T23:59:59.999${NAIROBI_OFFSET}`);
}

/**
 * A date a client sent as a filter. A bare day ("2026-11-05") means the whole Nairobi day, so a range
 * [2026-11-05, 2026-11-05] is that one day and not an empty instant. A full timestamp is taken as given.
 */
export function parseFilterDate(value: string, edge: 'start' | 'end', label = 'Date'): Date {
  const raw = String(value ?? '').trim();
  const d = DAY_ONLY.test(raw) ? (edge === 'start' ? nairobiDayStart(raw) : nairobiDayEnd(raw)) : new Date(raw);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label} is not a valid date`);
  return d;
}

/** Whole Nairobi calendar days from `from` to `to` (negative when `to` is earlier). */
export function nairobiDaysBetween(from: Date, to: Date): number {
  const a = Date.parse(`${nairobiDay(from)}T00:00:00Z`);
  const b = Date.parse(`${nairobiDay(to)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
