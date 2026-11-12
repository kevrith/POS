import { nairobiDay } from '../common/dates';

/** When a follow-up falls, and how the reminder reads. Pure, so it can be tested alone. */

export type FollowUpBucket = 'overdue' | 'today' | 'soon';

/** Overdue (the day has passed), today, or soon (still ahead), by Nairobi calendar day. */
export function followUpBucket(followUpDate: Date, now = new Date()): FollowUpBucket {
  const due = nairobiDay(followUpDate);
  const today = nairobiDay(now);
  return due < today ? 'overdue' : due === today ? 'today' : 'soon';
}

/** Whole days past due (0 when due today or later). */
export function daysOverdue(followUpDate: Date, now = new Date()): number {
  const diff = Math.round((Date.parse(`${nairobiDay(now)}T00:00:00Z`) - Date.parse(`${nairobiDay(followUpDate)}T00:00:00Z`)) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/** The SMS a patient receives. Short, plain, and says who it is from; it names no condition. */
export function reminderMessage(patientName: string, business: string, followUpDate: Date): string {
  const first = patientName.trim().split(/\s+/)[0] || 'there';
  const date = followUpDate.toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short' });
  return `Hello ${first}, a reminder from ${business}: your follow-up visit is due on ${date}. Please come in or call us to book a time.`;
}
