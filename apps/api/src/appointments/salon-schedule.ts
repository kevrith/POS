/**
 * Pure scheduling rules for appointments: a staff member's weekly hours, and laying several services one after another.
 * No database here, so the rules can be tested exhaustively.
 *
 * Times are Nairobi time (UTC+3, no daylight saving), because that is the clock a shop works to.
 */
const NAIROBI_OFFSET_MS = 3 * 60 * 60_000;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Weekly hours: weekday (0 = Sunday ... 6 = Saturday) to [from, to]. A weekday left out is a day off. */
export type WorkingHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', [string, string]>>;

export interface ServiceSlot {
  itemId?: string | null;
  name: string;
  unitPriceCents: number;
  durationMin: number;
  staffId?: string | null;
}

export interface PlacedService extends ServiceSlot {
  start: Date;
  end: Date;
}

const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/**
 * Check and tidy weekly hours as stored. Throws a message a person can act on. `{}` (or nothing) means "no restriction".
 */
export function parseWorkingHours(raw: unknown): WorkingHours {
  if (raw === undefined || raw === null || raw === '') return {};
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { throw new Error('Working hours are not valid'); }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Working hours are not valid');
  const out: WorkingHours = {};
  for (const [day, range] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day)) throw new Error(`"${day}" is not a day of the week`);
    if (!Array.isArray(range) || range.length !== 2) throw new Error('Each working day needs a start and an end time');
    const [from, to] = range.map(String);
    const a = minutesOf(from);
    const b = minutesOf(to);
    if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('Times must look like 09:00');
    if (b <= a) throw new Error('A working day must end after it starts');
    out[day as keyof WorkingHours] = [from, to];
  }
  return out;
}

/** Nairobi weekday (0-6) and minute of the day for an instant. */
export function nairobiParts(at: Date): { weekday: number; minute: number } {
  const t = new Date(at.getTime() + NAIROBI_OFFSET_MS);
  return { weekday: t.getUTCDay(), minute: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

/**
 * Is [start, end) inside the staff member's hours? No hours at all means no restriction. A visit that runs past midnight is
 * never inside a single working day, so it is outside.
 */
export function withinWorkingHours(hours: WorkingHours, start: Date, end: Date): boolean {
  if (Object.keys(hours).length === 0) return true;
  const a = nairobiParts(start);
  const b = nairobiParts(end);
  if (a.weekday !== b.weekday && !(b.minute === 0 && end.getTime() - start.getTime() <= 24 * 60 * 60_000)) return false;
  const day = hours[String(a.weekday) as keyof WorkingHours];
  if (!day) return false;
  const endMinute = a.weekday !== b.weekday ? 24 * 60 : b.minute;
  return a.minute >= minutesOf(day[0]) && endMinute <= minutesOf(day[1]);
}

/** Lay services one after another from `start`, in the order given. */
export function placeServices(start: Date, services: ServiceSlot[]): PlacedService[] {
  let cursor = start.getTime();
  return services.map((s) => {
    const placed = { ...s, start: new Date(cursor), end: new Date(cursor + s.durationMin * 60_000) };
    cursor = placed.end.getTime();
    return placed;
  });
}

/** Total minutes of all services. */
export const totalMinutes = (services: ServiceSlot[]): number => services.reduce((sum, s) => sum + s.durationMin, 0);
