import {
  findMyEmployee, shiftHours, formatDuration, totalHours, todaysEntries,
  currentlyOnShift, normalizeStatus, validateLeaveRequest, LEAVE_TYPES,
  type TimeEntry, type EmployeeRow,
} from '../lib/hr';

const entry = (over: Partial<TimeEntry> = {}): TimeEntry => ({
  id: 'e1', clockIn: '2026-08-13T06:00:00Z', clockOut: '2026-08-13T14:00:00Z', ...over,
});

describe('findMyEmployee', () => {
  const rows: EmployeeRow[] = [
    { id: 'emp1', userId: 'u1', user: { name: 'Grace' } },
    { id: 'emp2', userId: 'u2', user: { name: 'Otieno' } },
  ];

  it('matches on userId, not employee id', () => {
    expect(findMyEmployee(rows, 'u2')?.id).toBe('emp2');
  });

  // A user with no Employee record cannot request leave; the screen must be able
  // to tell, rather than posting an empty employeeId.
  it('returns undefined when the user has no HR record', () => {
    expect(findMyEmployee(rows, 'u9')).toBeUndefined();
    expect(findMyEmployee(rows, undefined)).toBeUndefined();
    expect(findMyEmployee(undefined, 'u1')).toBeUndefined();
  });
});

describe('shiftHours', () => {
  it('measures a closed shift end to end', () => {
    expect(shiftHours(entry())).toBe(8);
  });

  it('rounds to one decimal', () => {
    expect(shiftHours(entry({ clockOut: '2026-08-13T09:30:00Z' }))).toBe(3.5);
    expect(shiftHours(entry({ clockOut: '2026-08-13T06:20:00Z' }))).toBe(0.3);
  });

  // An open shift is what drives the live counter, so it measures against now.
  it('measures an open shift against the current time', () => {
    const now = new Date('2026-08-13T09:00:00Z');
    expect(shiftHours(entry({ clockOut: null }), now)).toBe(3);
  });

  it('returns 0 rather than a negative for clock-out before clock-in', () => {
    expect(shiftHours(entry({ clockOut: '2026-08-13T05:00:00Z' }))).toBe(0);
  });

  it('survives an unparseable timestamp', () => {
    expect(shiftHours(entry({ clockIn: 'nonsense' }))).toBe(0);
  });
});

describe('formatDuration', () => {
  const now = new Date('2026-08-13T09:24:00Z');

  it('shows hours and minutes once past an hour', () => {
    expect(formatDuration('2026-08-13T06:00:00Z', now)).toBe('3h 24m');
  });

  it('drops the hours segment under an hour', () => {
    expect(formatDuration('2026-08-13T09:00:00Z', now)).toBe('24m');
  });

  it('never shows a negative for a future clock-in', () => {
    expect(formatDuration('2026-08-13T12:00:00Z', now)).toBe('0m');
  });

  it('degrades to a dash for a bad timestamp', () => {
    expect(formatDuration('nope', now)).toBe('—');
  });
});

describe('totalHours', () => {
  it('sums across shifts and rounds once at the end', () => {
    expect(totalHours([
      entry({ clockOut: '2026-08-13T09:30:00Z' }),
      entry({ id: 'e2', clockIn: '2026-08-12T06:00:00Z', clockOut: '2026-08-12T10:00:00Z' }),
    ])).toBe(7.5);
  });

  it('is zero for no entries', () => {
    expect(totalHours([])).toBe(0);
  });
});

describe('todaysEntries', () => {
  it('keeps only shifts that started today in local time', () => {
    const now = new Date('2026-08-13T15:00:00');
    const today = entry({ id: 'today', clockIn: '2026-08-13T08:00:00' });
    const yesterday = entry({ id: 'yesterday', clockIn: '2026-08-12T08:00:00' });
    const result = todaysEntries([today, yesterday], now);
    expect(result.map((e) => e.id)).toEqual(['today']);
  });
});

describe('currentlyOnShift', () => {
  it('keeps only open shifts, newest first', () => {
    const result = currentlyOnShift([
      entry({ id: 'closed' }),
      entry({ id: 'open-early', clockIn: '2026-08-13T06:00:00Z', clockOut: null }),
      entry({ id: 'open-late', clockIn: '2026-08-13T11:00:00Z', clockOut: null }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['open-late', 'open-early']);
  });

  it('returns nothing when everyone has clocked out', () => {
    expect(currentlyOnShift([entry()])).toHaveLength(0);
  });
});

describe('normalizeStatus', () => {
  it('recognises approved and rejected, defaulting everything else to pending', () => {
    expect(normalizeStatus('APPROVED')).toBe('APPROVED');
    expect(normalizeStatus('rejected')).toBe('REJECTED');
    expect(normalizeStatus('PENDING')).toBe('PENDING');
    expect(normalizeStatus(null)).toBe('PENDING');
    expect(normalizeStatus('WEIRD')).toBe('PENDING');
  });
});

describe('validateLeaveRequest', () => {
  it('accepts a well-formed range', () => {
    expect(validateLeaveRequest('2026-09-01', '2026-09-05')).toBeNull();
  });

  it('accepts a single-day request', () => {
    expect(validateLeaveRequest('2026-09-01', '2026-09-01')).toBeNull();
  });

  // The endpoint feeds these straight into `new Date(...)`, so a free-text date
  // would be stored as an Invalid Date.
  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(validateLeaveRequest('01/09/2026', '2026-09-05')).toMatch(/YYYY-MM-DD/);
    expect(validateLeaveRequest('2026-09-01', 'next friday')).toMatch(/YYYY-MM-DD/);
    expect(validateLeaveRequest('', '')).toMatch(/YYYY-MM-DD/);
  });

  it('rejects an impossible date', () => {
    expect(validateLeaveRequest('2026-13-45', '2026-13-46')).not.toBeNull();
  });

  it('rejects an end date before the start', () => {
    expect(validateLeaveRequest('2026-09-10', '2026-09-01')).toMatch(/before/);
  });

  it('tolerates surrounding whitespace', () => {
    expect(validateLeaveRequest(' 2026-09-01 ', ' 2026-09-05 ')).toBeNull();
  });
});

describe('LEAVE_TYPES', () => {
  it('offers the standard Kenyan leave categories', () => {
    expect(LEAVE_TYPES).toContain('ANNUAL');
    expect(LEAVE_TYPES).toContain('SICK');
    expect(LEAVE_TYPES).toContain('MATERNITY');
    expect(LEAVE_TYPES).toContain('PATERNITY');
  });
});
