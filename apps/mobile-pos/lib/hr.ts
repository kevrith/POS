/**
 * Pure helpers for the HR screens.
 *
 * Two parallel systems exist on the API and it matters which is used where:
 *
 *  - `/hr/time-entries/*` is keyed by **userId** — the clock-in/out the app uses,
 *    because a signed-in user always has an id.
 *  - `/hr/attendance/*`, `/hr/leave` and `/hr/salary-advances` are keyed by
 *    **employeeId** (the `Employee` row), which has to be resolved from the
 *    roster first. A user without an Employee record cannot request leave at
 *    all, so the screens have to say so rather than posting a blank id.
 */

export interface ClockStatus {
  isClockedIn: boolean;
  clockedInSince: string | null;
  entryId: string | null;
}

export interface TimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
  user?: { name?: string; role?: string } | null;
}

export interface EmployeeRow {
  id: string;
  userId: string;
  user?: { name?: string; role?: string } | null;
}

export interface LeaveRow {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: string;
  createdAt: string;
}

export interface AdvanceRow {
  id: string;
  amountCents: number;
  reason: string;
  status: string;
  requestedAt: string;
}

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE'];

/** Find the signed-in user's Employee row; undefined when they have none. */
export function findMyEmployee(rows: EmployeeRow[] | undefined, userId: string | undefined): EmployeeRow | undefined {
  if (!userId) return undefined;
  return (rows ?? []).find((e) => e.userId === userId);
}

/**
 * Hours worked on a shift, to one decimal.
 *
 * An entry with no `clockOut` is still running, so it is measured against now —
 * that is what makes the live "3.4h so far" counter work.
 */
export function shiftHours(entry: TimeEntry, now: Date = new Date()): number {
  const start = new Date(entry.clockIn).getTime();
  if (Number.isNaN(start)) return 0;
  const end = entry.clockOut ? new Date(entry.clockOut).getTime() : now.getTime();
  if (Number.isNaN(end) || end < start) return 0;
  return Math.round(((end - start) / 3_600_000) * 10) / 10;
}

/** "3h 24m" for a running shift; the phrasing a payslip query starts from. */
export function formatDuration(fromISO: string, now: Date = new Date()): string {
  const start = new Date(fromISO).getTime();
  if (Number.isNaN(start)) return '—';
  const mins = Math.max(0, Math.floor((now.getTime() - start) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Total hours across a set of entries — the "this week" figure. */
export function totalHours(entries: TimeEntry[], now: Date = new Date()): number {
  return Math.round(entries.reduce((sum, e) => sum + shiftHours(e, now), 0) * 10) / 10;
}

/** Entries that started today, in the device's timezone. */
export function todaysEntries(entries: TimeEntry[], now: Date = new Date()): TimeEntry[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  return entries.filter((e) => {
    const t = new Date(e.clockIn).getTime();
    return !Number.isNaN(t) && t >= start.getTime() && t <= end.getTime();
  });
}

/**
 * Who is on the clock right now, newest first.
 *
 * `clockOut === null` is the marker; the endpoint returns closed shifts too.
 */
export function currentlyOnShift(entries: TimeEntry[]): TimeEntry[] {
  return entries
    .filter((e) => e.clockOut === null)
    .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime());
}

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export function normalizeStatus(raw?: string | null): LeaveStatus {
  const upper = (raw ?? '').toUpperCase();
  return upper === 'APPROVED' || upper === 'REJECTED' ? (upper as LeaveStatus) : 'PENDING';
}

/**
 * Validate a leave request before it is posted.
 *
 * Returns an error message, or null when the request is fine. Dates are
 * `YYYY-MM-DD` because the endpoint feeds them straight to `new Date(...)`.
 */
export function validateLeaveRequest(startDate: string, endDate: string): string | null {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate.trim()) || !dateRe.test(endDate.trim())) {
    return 'Use the format YYYY-MM-DD for both dates, e.g. 2026-09-01.';
  }
  const start = new Date(startDate.trim());
  const end = new Date(endDate.trim());
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'One of those dates is not a real date.';
  }
  if (end < start) {
    return 'The end date is before the start date.';
  }
  return null;
}
