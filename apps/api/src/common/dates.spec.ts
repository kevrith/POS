import { BadRequestException } from '@nestjs/common';
import { nairobiDay, nairobiDayEnd, nairobiDayStart, nairobiDaysBetween, parseFilterDate } from './dates';

describe('Nairobi day helpers', () => {
  it('puts 22:00 UTC on the next Nairobi day', () => {
    expect(nairobiDay(new Date('2026-11-05T20:59:59Z'))).toBe('2026-11-05');
    expect(nairobiDay(new Date('2026-11-05T21:00:00Z'))).toBe('2026-11-06');
  });

  it('a day runs from 21:00 UTC the evening before to 20:59:59.999 UTC', () => {
    expect(nairobiDayStart('2026-11-05').toISOString()).toBe('2026-11-04T21:00:00.000Z');
    expect(nairobiDayEnd('2026-11-05').toISOString()).toBe('2026-11-05T20:59:59.999Z');
  });

  it('a one-day filter range is the whole day, not an empty instant', () => {
    const from = parseFilterDate('2026-11-05', 'start');
    const to = parseFilterDate('2026-11-05', 'end');
    expect(to.getTime() - from.getTime()).toBe(86_400_000 - 1);
    const at = new Date('2026-11-05T01:30:00+03:00');
    expect(at >= from && at <= to).toBe(true);
  });

  it('takes a full timestamp as given and rejects nonsense', () => {
    expect(parseFilterDate('2026-11-05T10:00:00Z', 'end').toISOString()).toBe('2026-11-05T10:00:00.000Z');
    expect(() => parseFilterDate('not-a-date', 'start')).toThrow(BadRequestException);
    expect(() => parseFilterDate('2026-13-45', 'start')).toThrow(BadRequestException);
  });

  it('counts calendar days in Nairobi, not 24-hour blocks', () => {
    expect(nairobiDaysBetween(new Date('2026-11-05T22:30:00+03:00'), new Date('2026-11-06T01:00:00+03:00'))).toBe(1);
    expect(nairobiDaysBetween(new Date('2026-11-05T08:00:00+03:00'), new Date('2026-11-05T23:00:00+03:00'))).toBe(0);
    expect(nairobiDaysBetween(new Date('2026-11-07T08:00:00+03:00'), new Date('2026-11-05T08:00:00+03:00'))).toBe(-2);
  });
});
