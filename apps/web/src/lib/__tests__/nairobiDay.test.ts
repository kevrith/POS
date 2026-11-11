import { describe, expect, it } from 'vitest';
import { nairobiDay } from '../nairobiDay';

describe('nairobiDay', () => {
  it('is the Nairobi date, not the UTC date, between midnight and 3 am (the bug)', () => {
    // 00:30 in Nairobi on 11 Nov is 21:30 UTC on 10 Nov
    const at = new Date('2026-11-10T21:30:00Z');
    expect(at.toISOString().slice(0, 10)).toBe('2026-11-10');
    expect(nairobiDay(at)).toBe('2026-11-11');
  });

  it('agrees with UTC the rest of the day', () => {
    expect(nairobiDay(new Date('2026-11-11T05:00:00Z'))).toBe('2026-11-11');
    expect(nairobiDay(new Date('2026-11-11T20:59:00Z'))).toBe('2026-11-11');
    expect(nairobiDay(new Date('2026-11-11T21:00:00Z'))).toBe('2026-11-12');
  });

  it('is zero-padded and valid across a year end', () => {
    expect(nairobiDay(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01');
    expect(nairobiDay(new Date('2026-03-05T09:00:00Z'))).toBe('2026-03-05');
  });
});
