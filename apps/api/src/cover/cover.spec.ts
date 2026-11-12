import { agingByProvider, ageBucket, claimReadiness, cleanIcd11, coverStanding, splitBill, type CheckLike, type ReadinessInput } from './cover';

const visit = { id: 'v1', createdAt: new Date('2026-11-12T09:00:00Z') };
const check = (o: Partial<CheckLike> = {}): CheckLike => ({ providerId: 'sha', memberNumber: '12345', status: 'ELIGIBLE', visitId: 'v1', checkedAt: new Date('2026-11-12T09:05:00Z'), ...o });

describe('coverStanding', () => {
  it('is not checked when nobody checked', () => {
    expect(coverStanding([], visit, 'sha', '12345')).toBe('NOT_CHECKED');
  });

  it('takes the latest answer for this insurer and member number', () => {
    const checks = [check({ status: 'NOT_ELIGIBLE' }), check({ status: 'ELIGIBLE', checkedAt: new Date('2026-11-12T09:30:00Z') })];
    expect(coverStanding(checks, visit, 'sha', '12345')).toBe('ELIGIBLE');
    const reversed = [check({ status: 'ELIGIBLE' }), check({ status: 'NOT_ELIGIBLE', checkedAt: new Date('2026-11-12T09:30:00Z') })];
    expect(coverStanding(reversed, visit, 'sha', '12345')).toBe('NOT_ELIGIBLE');
  });

  it('ignores other insurers, other members and other visits', () => {
    expect(coverStanding([check({ providerId: 'other' })], visit, 'sha', '12345')).toBe('NOT_CHECKED');
    expect(coverStanding([check({ memberNumber: '99999' })], visit, 'sha', '12345')).toBe('NOT_CHECKED');
    expect(coverStanding([check({ visitId: 'v2' })], visit, 'sha', '12345')).toBe('NOT_CHECKED');
  });

  it('ignores spaces and case in the member number', () => {
    expect(coverStanding([check({ memberNumber: 'AB 123' })], visit, 'sha', 'ab123')).toBe('ELIGIBLE');
  });

  it('counts a check made shortly before the visit opened, but not a stale one', () => {
    expect(coverStanding([check({ visitId: null, checkedAt: new Date('2026-11-12T03:00:00Z') })], visit, 'sha', '12345')).toBe('ELIGIBLE');
    expect(coverStanding([check({ visitId: null, checkedAt: new Date('2026-11-10T09:00:00Z') })], visit, 'sha', '12345')).toBe('NOT_CHECKED');
  });

  it('treats "could not reach the insurer" as unknown, not as eligible', () => {
    expect(coverStanding([check({ status: 'UNAVAILABLE' })], visit, 'sha', '12345')).toBe('UNAVAILABLE');
  });
});

describe('splitBill', () => {
  it('adds up exactly', () => {
    expect(splitBill(10_000, 20)).toEqual({ patientCents: 2000, insurerCents: 8000 });
    expect(splitBill(1001, 33)).toEqual({ patientCents: 330, insurerCents: 671 });
    expect(splitBill(5000, 0)).toEqual({ patientCents: 0, insurerCents: 5000 });
  });
});

describe('claimReadiness', () => {
  const ready = (o: Partial<ReadinessInput> = {}): ReadinessInput => ({
    providerKind: 'SHA', requiresEligibility: true, memberNumber: '12345', coverStatus: 'ELIGIBLE',
    diagnoses: [{ label: 'Malaria', code: 'B54', icd11: '1F40' }], lineCount: 2, fromVisit: true, ...o,
  });

  it('is empty for a complete claim', () => {
    expect(claimReadiness(ready())).toEqual([]);
  });

  it('says what is missing', () => {
    expect(claimReadiness(ready({ memberNumber: ' ' }))).toContain('Member number is missing');
    expect(claimReadiness(ready({ coverStatus: 'NOT_CHECKED' }))).toContain('Cover has not been confirmed');
    expect(claimReadiness(ready({ coverStatus: 'NOT_ELIGIBLE' }))).toContain('Cover was found not eligible');
    expect(claimReadiness(ready({ lineCount: 0 }))).toContain('No services or medicines on the claim');
    expect(claimReadiness(ready({ diagnoses: [] }))).toContain('No diagnosis recorded');
  });

  it('asks SHA claims for ICD-11 and private insurers not to', () => {
    const noIcd11 = [{ label: 'Malaria', code: 'B54' }];
    expect(claimReadiness(ready({ diagnoses: noIcd11 }))).toContain('SHA needs an ICD-11 code on every diagnosis');
    expect(claimReadiness(ready({ diagnoses: noIcd11, providerKind: 'PRIVATE' }))).toEqual([]);
  });

  it('does not ask a pharmacy fill for a diagnosis, and skips eligibility for insurers that do not need it', () => {
    expect(claimReadiness(ready({ fromVisit: false, diagnoses: [], providerKind: 'PRIVATE' }))).toEqual([]);
    expect(claimReadiness(ready({ requiresEligibility: false, coverStatus: 'NOT_CHECKED' }))).toEqual([]);
  });
});

describe('aging', () => {
  const now = new Date('2026-11-30T00:00:00Z');
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it('puts days into buckets', () => {
    expect([0, 30, 31, 60, 61, 90, 91].map(ageBucket)).toEqual(['0-30', '0-30', '31-60', '31-60', '61-90', '61-90', '90+']);
  });

  it('adds what each insurer still owes, and leaves settled claims out', () => {
    const rows = agingByProvider([
      { providerId: 'a', providerName: 'A', status: 'SUBMITTED', billedCents: 1000, approvedCents: 0, submittedAt: day(5) },
      { providerId: 'a', providerName: 'A', status: 'APPROVED', billedCents: 2000, approvedCents: 1500, submittedAt: day(45) },
      { providerId: 'a', providerName: 'A', status: 'PAID', billedCents: 9999, approvedCents: 9999, submittedAt: day(45) },
      { providerId: 'b', providerName: 'B', status: 'SUBMITTED', billedCents: 700, approvedCents: 0, submittedAt: day(120) },
    ], now);
    expect(rows[0]).toMatchObject({ providerId: 'a', totalCents: 2500, count: 2, buckets: { '0-30': 1000, '31-60': 1500, '61-90': 0, '90+': 0 } });
    expect(rows[1]).toMatchObject({ providerId: 'b', totalCents: 700, buckets: { '90+': 700 } });
  });
});

describe('cleanIcd11', () => {
  it('upper-cases and accepts the classification\'s shapes', () => {
    expect(cleanIcd11('1f40')).toBe('1F40');
    expect(cleanIcd11(' ca40.0 ')).toBe('CA40.0');
    expect(cleanIcd11('')).toBeUndefined();
    expect(() => cleanIcd11('J06.9!')).toThrow('not an ICD-11 code');
  });
});
