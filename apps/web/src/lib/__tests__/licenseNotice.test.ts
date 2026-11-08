import { describe, expect, it } from 'vitest';
import { licenseNotice, type LicenseStatus } from '../licenseNotice';

const base: LicenseStatus = {
  edition: 'LOCAL', configured: true, state: 'NONE', tier: null, tokenExpiresAt: null, licenseExpiresAt: null, graceEndsAt: null,
  daysLeft: null, clockBehind: false, machineId: 'm', keyHint: null, serverStatus: null, serverMessage: null, lastRenewedAt: null,
  trial: { active: true, endsAt: null, daysLeft: 20 },
};
const with_ = (o: Partial<LicenseStatus>): LicenseStatus => ({ ...base, ...o });

describe('what the owner is told about the licence', () => {
  it('says nothing on the cloud edition, which has no licence', () => {
    expect(licenseNotice(with_({ edition: 'CLOUD' }))).toBeNull();
    expect(licenseNotice(undefined)).toBeNull();
  });

  it('says nothing while the licence is healthy', () => {
    expect(licenseNotice(with_({ state: 'ACTIVE', tier: 'PRO', daysLeft: 25, trial: null }))).toBeNull();
  });

  it('mentions a trial only in its last week', () => {
    expect(licenseNotice(base)).toBeNull();
    expect(licenseNotice(with_({ trial: { active: true, endsAt: null, daysLeft: 3 } }))?.message).toContain('3 days');
    expect(licenseNotice(with_({ trial: { active: true, endsAt: null, daysLeft: 1 } }))?.message).toContain('1 day.');
  });

  it('says plainly when the trial is over', () => {
    const n = licenseNotice(with_({ trial: { active: false, endsAt: null, daysLeft: 0 } }));
    expect(n?.tone).toBe('warning');
    expect(n?.message).toContain('Free plan');
  });

  it('asks to connect before the licence runs out, then warns in red during grace and after the lapse', () => {
    expect(licenseNotice(with_({ state: 'EXPIRING_SOON', tier: 'PRO', daysLeft: 5 }))).toMatchObject({ tone: 'warning', message: expect.stringContaining('5 days') });
    const soon = new Date(Date.now() + 3 * 86_400_000 - 1000).toISOString();
    expect(licenseNotice(with_({ state: 'GRACE', tier: 'PRO', graceEndsAt: soon }))).toMatchObject({ tone: 'danger', message: expect.stringContaining('3 days') });
    expect(licenseNotice(with_({ state: 'LAPSED', tier: 'PRO' }))).toMatchObject({ tone: 'danger', message: expect.stringContaining('data is safe') });
  });

  it('a wrong clock outranks everything, because nothing else can be trusted', () => {
    expect(licenseNotice(with_({ state: 'ACTIVE', tier: 'PRO', clockBehind: true }))?.message).toContain('clock');
  });
});
