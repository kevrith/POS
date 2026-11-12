import { daysOverdue, followUpBucket, reminderMessage } from './follow-ups';

const NOW = new Date('2026-11-12T10:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('followUpBucket', () => {
  it('splits by Nairobi day', () => {
    expect(followUpBucket(day('2026-11-11'), NOW)).toBe('overdue');
    expect(followUpBucket(day('2026-11-12'), NOW)).toBe('today');
    expect(followUpBucket(day('2026-11-13'), NOW)).toBe('soon');
  });
  it('uses the Nairobi day late in the evening UTC', () => {
    const lateEvening = new Date('2026-11-12T22:00:00Z'); // already the 13th in Nairobi
    expect(followUpBucket(day('2026-11-12'), lateEvening)).toBe('overdue');
    expect(followUpBucket(day('2026-11-13'), lateEvening)).toBe('today');
  });
});

describe('daysOverdue', () => {
  it('counts whole days past, never negative', () => {
    expect(daysOverdue(day('2026-11-07'), NOW)).toBe(5);
    expect(daysOverdue(day('2026-11-12'), NOW)).toBe(0);
    expect(daysOverdue(day('2026-11-20'), NOW)).toBe(0);
  });
});

describe('reminderMessage', () => {
  it('uses the first name, names the clinic, and says nothing about the illness', () => {
    const m = reminderMessage('Wanjiru Kamau', 'Afya Clinic', day('2026-11-20'));
    expect(m).toContain('Hello Wanjiru');
    expect(m).toContain('Afya Clinic');
    expect(m).toMatch(/20 Nov/);
    expect(m.length).toBeLessThan(200);
  });
  it('copes with an empty name', () => {
    expect(reminderMessage('  ', 'C', day('2026-11-20'))).toContain('Hello there');
  });
});
