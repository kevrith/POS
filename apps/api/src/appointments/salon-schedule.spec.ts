import { nairobiParts, parseWorkingHours, placeServices, totalMinutes, withinWorkingHours } from './salon-schedule';

// 2026-11-11 is a Wednesday. 09:00 Nairobi = 06:00 UTC.
const at = (hhmm: string, day = '2026-11-11') => new Date(`${day}T${hhmm}:00+03:00`);

describe('parseWorkingHours', () => {
  it('accepts weekly hours given as an object or as JSON text, and treats nothing as no restriction', () => {
    expect(parseWorkingHours({ '1': ['09:00', '18:00'] })).toEqual({ '1': ['09:00', '18:00'] });
    expect(parseWorkingHours('{"3":["08:30","17:00"]}')).toEqual({ '3': ['08:30', '17:00'] });
    expect(parseWorkingHours(undefined)).toEqual({});
    expect(parseWorkingHours('{}')).toEqual({});
    expect(parseWorkingHours('')).toEqual({});
  });

  it('refuses hours it cannot make sense of, in words', () => {
    expect(() => parseWorkingHours('not json')).toThrow(/not valid/);
    expect(() => parseWorkingHours([])).toThrow(/not valid/);
    expect(() => parseWorkingHours({ '7': ['09:00', '18:00'] })).toThrow(/day of the week/);
    expect(() => parseWorkingHours({ '1': ['9:00', '18:00'] })).toThrow(/09:00/);
    expect(() => parseWorkingHours({ '1': ['09:00'] })).toThrow(/start and an end/);
    expect(() => parseWorkingHours({ '1': ['18:00', '09:00'] })).toThrow(/end after/);
    expect(() => parseWorkingHours({ '1': ['09:00', '09:00'] })).toThrow(/end after/);
    expect(() => parseWorkingHours({ '1': ['09:00', '25:00'] })).toThrow(/09:00/);
  });
});

describe('nairobiParts', () => {
  it('reads the Nairobi weekday and minute, not the UTC ones', () => {
    // 00:30 Nairobi on Wednesday is 21:30 UTC on Tuesday
    expect(nairobiParts(new Date('2026-11-10T21:30:00Z'))).toEqual({ weekday: 3, minute: 30 });
    expect(nairobiParts(at('09:00'))).toEqual({ weekday: 3, minute: 540 });
  });
});

describe('withinWorkingHours', () => {
  const wed = { '3': ['09:00', '18:00'] } as ReturnType<typeof parseWorkingHours>;

  it('has no restriction without hours', () => {
    expect(withinWorkingHours({}, at('03:00'), at('04:00'))).toBe(true);
  });

  it('allows a visit inside the day, up to the closing minute, and refuses one that starts early or ends late', () => {
    expect(withinWorkingHours(wed, at('09:00'), at('10:00'))).toBe(true);
    expect(withinWorkingHours(wed, at('17:00'), at('18:00'))).toBe(true);
    expect(withinWorkingHours(wed, at('08:45'), at('09:45'))).toBe(false);
    expect(withinWorkingHours(wed, at('17:30'), at('18:30'))).toBe(false);
  });

  it('refuses a day that is not listed (a day off)', () => {
    expect(withinWorkingHours(wed, at('10:00', '2026-11-12'), at('11:00', '2026-11-12'))).toBe(false);
  });

  it('refuses a visit that runs across midnight', () => {
    const lateNight = { '3': ['09:00', '23:59'] } as ReturnType<typeof parseWorkingHours>;
    expect(withinWorkingHours(lateNight, at('23:30'), at('00:30', '2026-11-12'))).toBe(false);
  });

  it('judges by the Nairobi clock: 06:00 UTC is 09:00 in the shop', () => {
    expect(withinWorkingHours(wed, new Date('2026-11-11T06:00:00Z'), new Date('2026-11-11T07:00:00Z'))).toBe(true);
    expect(withinWorkingHours(wed, new Date('2026-11-11T05:00:00Z'), new Date('2026-11-11T06:00:00Z'))).toBe(false);
  });
});

describe('placeServices', () => {
  const s = (name: string, durationMin: number, staffId?: string) => ({ name, durationMin, unitPriceCents: 100, staffId });

  it('lays services end to end from the start, in order', () => {
    const placed = placeServices(at('10:00'), [s('Cut', 45, 'a'), s('Colour', 90, 'b'), s('Style', 30)]);
    expect(placed.map((p) => [p.name, p.start.toISOString(), p.end.toISOString()])).toEqual([
      ['Cut', at('10:00').toISOString(), at('10:45').toISOString()],
      ['Colour', at('10:45').toISOString(), at('12:15').toISOString()],
      ['Style', at('12:15').toISOString(), at('12:45').toISOString()],
    ]);
  });

  it('adds up the minutes', () => {
    expect(totalMinutes([s('a', 45), s('b', 90)])).toBe(135);
    expect(totalMinutes([])).toBe(0);
  });
});
