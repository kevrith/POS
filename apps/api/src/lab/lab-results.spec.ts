import { canVerify, cleanParameters, evaluateResults, flagNumber, orderStatusFrom, rangeFor, type LabParameter } from './lab-results';

const hb: LabParameter = { name: 'Haemoglobin', kind: 'NUMERIC', unit: 'g/dL', low: 13, high: 17, lowF: 12, highF: 15, lowC: 11.5, highC: 15.5, critLow: 7 };
const malaria: LabParameter = { name: 'Result', kind: 'CHOICE', choices: ['Negative', 'Positive'], abnormal: ['Positive'] };

describe('cleanParameters', () => {
  it('keeps what makes sense and drops what does not apply to the type', () => {
    const [p] = cleanParameters([{ name: ' Haemoglobin ', kind: 'numeric', unit: 'g/dL', low: '13', high: 17, critLow: 7, choices: ['x', 'y'] }]);
    expect(p).toEqual({ name: 'Haemoglobin', kind: 'NUMERIC', unit: 'g/dL', low: 13, high: 17, critLow: 7 });
  });

  it('needs a parameter, no repeats, and sensible ranges', () => {
    expect(() => cleanParameters([])).toThrow(/at least one/);
    expect(() => cleanParameters([{ name: 'A' }, { name: 'a' }])).toThrow(/twice/);
    expect(() => cleanParameters([{ name: 'A', low: 5, high: 1 }])).toThrow(/low is above its high/);
    expect(() => cleanParameters([{ name: 'A', low: 5, high: 9, critLow: 6 }])).toThrow(/critical low/);
    expect(() => cleanParameters([{ name: 'A', low: 5, high: 9, critHigh: 8 }])).toThrow(/critical high/);
    expect(() => cleanParameters([{ name: 'A', kind: 'WEIRD' }])).toThrow(/result type/);
  });

  it('a choice needs two options and abnormal ones must be among them', () => {
    expect(() => cleanParameters([{ name: 'R', kind: 'CHOICE', choices: ['Only'] }])).toThrow(/two choices/);
    expect(() => cleanParameters([{ name: 'R', kind: 'CHOICE', choices: ['Neg', 'Pos'], abnormal: ['Maybe'] }])).toThrow(/not one of the choices/);
    expect(cleanParameters([{ name: 'R', kind: 'CHOICE', choices: ['Neg', 'Pos', 'Neg'], abnormal: ['Pos'] }])[0]).toEqual({ name: 'R', kind: 'CHOICE', choices: ['Neg', 'Pos'], abnormal: ['Pos'] });
  });
});

describe('flags', () => {
  it('uses the female range for a female patient, and the critical limits first', () => {
    expect(rangeFor(hb, 'F')).toEqual({ low: 12, high: 15 });
    expect(rangeFor(hb, 'M')).toEqual({ low: 13, high: 17 });
    expect(rangeFor({ ...hb, lowF: undefined, highF: undefined }, 'F')).toEqual({ low: 13, high: 17 });
    expect(flagNumber(12.5, hb, 'F')).toBe('NORMAL');
    expect(flagNumber(12.5, hb, 'M')).toBe('LOW');
    expect(flagNumber(16, hb, 'F')).toBe('HIGH');
    expect(flagNumber(6.5, hb, 'F')).toBe('CRITICAL_LOW');
    expect(flagNumber(13, hb, null)).toBe('NORMAL');
    expect(flagNumber(17, hb, 'M')).toBe('NORMAL');
  });
});

describe('evaluateResults', () => {
  it('judges each value and notes the range used', () => {
    const r = evaluateResults([hb], { Haemoglobin: '11.2' }, 'F');
    expect(r.values).toEqual([{ name: 'Haemoglobin', unit: 'g/dL', value: '11.2', low: 12, high: 15, flag: 'LOW' }]);
    expect(r.hasCritical).toBe(false);
  });

  it('marks a critical value', () => {
    expect(evaluateResults([hb], { Haemoglobin: 6 }, 'M').hasCritical).toBe(true);
  });

  it('a choice must be one offered; an abnormal choice is flagged', () => {
    expect(evaluateResults([malaria], { Result: 'Positive' }, null).values[0].flag).toBe('ABNORMAL');
    expect(evaluateResults([malaria], { Result: 'Negative' }, null).values[0].flag).toBe('NORMAL');
    expect(() => evaluateResults([malaria], { Result: 'Maybe' }, null)).toThrow(/choose one of/);
  });

  it('text is kept and not flagged', () => {
    const t: LabParameter = { name: 'Microscopy', kind: 'TEXT' };
    expect(evaluateResults([t], { Microscopy: '  No ova seen ' }, null).values[0]).toEqual({ name: 'Microscopy', value: 'No ova seen', flag: null });
  });

  it('blanks are not done, but something must be entered, and only what the test measures', () => {
    const wbc: LabParameter = { name: 'WBC', kind: 'NUMERIC', low: 4, high: 11 };
    expect(evaluateResults([hb, wbc], { Haemoglobin: '14', WBC: '' }, 'M').values).toHaveLength(1);
    expect(() => evaluateResults([hb], { Haemoglobin: '' }, 'M')).toThrow(/at least one/);
    expect(() => evaluateResults([hb], { Potassium: '4' }, 'M')).toThrow(/not measured/);
    expect(() => evaluateResults([hb], { Haemoglobin: 'lots' }, 'M')).toThrow();
    expect(() => evaluateResults([hb], [] as unknown as Record<string, unknown>, 'M')).toThrow(/by name/);
  });
});

describe('order status', () => {
  it('follows its tests', () => {
    expect(orderStatusFrom('ORDERED', ['PENDING'])).toBe('ORDERED');
    expect(orderStatusFrom('COLLECTED', ['PENDING', 'PENDING'])).toBe('COLLECTED');
    expect(orderStatusFrom('COLLECTED', ['RESULTED', 'PENDING'])).toBe('COLLECTED');
    expect(orderStatusFrom('COLLECTED', ['RESULTED', 'RESULTED'])).toBe('RESULTED');
    expect(orderStatusFrom('RESULTED', ['VERIFIED', 'RESULTED'])).toBe('RESULTED');
    expect(orderStatusFrom('RESULTED', ['VERIFIED', 'VERIFIED'])).toBe('VERIFIED');
    expect(orderStatusFrom('VERIFIED', ['VERIFIED', 'RESULTED'])).toBe('RESULTED');
    expect(orderStatusFrom('CANCELLED', ['PENDING'])).toBe('CANCELLED');
  });
});

describe('who may release', () => {
  it('a second person, except a manager', () => {
    expect(canVerify('u-1', { id: 'u-2', role: 'LAB_TECH' })).toBe(true);
    expect(canVerify('u-1', { id: 'u-1', role: 'LAB_TECH' })).toBe(false);
    expect(canVerify('u-1', { id: 'u-1', role: 'MANAGER' })).toBe(true);
    expect(canVerify('u-1', { id: 'u-1', role: 'DOCTOR' })).toBe(false);
    expect(canVerify(null, { id: 'u-1', role: 'LAB_TECH' })).toBe(false);
  });
});

describe('children\'s ranges', () => {
  it('a child under 12 is judged by the child range, whatever their sex', () => {
    expect(rangeFor(hb, 'M', 8)).toEqual({ low: 11.5, high: 15.5 });
    expect(rangeFor(hb, 'F', 11)).toEqual({ low: 11.5, high: 15.5 });
    expect(rangeFor(hb, 'M', 12)).toEqual({ low: 13, high: 17 });
    expect(rangeFor(hb, 'F', null)).toEqual({ low: 12, high: 15 });
    expect(rangeFor({ ...hb, lowC: undefined, highC: undefined }, 'M', 4)).toEqual({ low: 13, high: 17 });
  });

  it('the same value reads differently for a child, and the range used is recorded', () => {
    expect(flagNumber(12, hb, 'M', 8)).toBe('NORMAL');
    expect(flagNumber(12, hb, 'M', 30)).toBe('LOW');
    const r = evaluateResults([hb], { Haemoglobin: '11' }, 'M', 6);
    expect(r.values[0]).toMatchObject({ low: 11.5, high: 15.5, flag: 'LOW' });
  });

  it('a child range must make sense', () => {
    expect(() => cleanParameters([{ name: 'A', low: 1, high: 9, lowC: 8, highC: 2 }])).toThrow(/child range/);
    expect(cleanParameters([{ name: 'A', low: 1, high: 9, lowC: '2', highC: 5 }])[0]).toMatchObject({ lowC: 2, highC: 5 });
  });
});
