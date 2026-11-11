/**
 * Calendar days in Nairobi (UTC+3, no daylight saving) as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` is the day in UTC, which is still YESTERDAY in Nairobi between midnight and 3 am: a
 * booking screen opened then showed the previous day and refused to book "today" as being in the past.
 */
export function nairobiDay(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
