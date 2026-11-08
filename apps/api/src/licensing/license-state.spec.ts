import { evaluateLicense, GRACE_DAYS, licenseTierToPlan, planFieldsFor, TOKEN_DAYS, WARN_DAYS } from './license-state';

const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);
const NOW = at('2026-11-08T12:00:00Z');
const snap = (tokenEnds: Date, over: Record<string, unknown> = {}) => ({ tier: 'PRO', tokenExpiresAt: tokenEnds, licenseExpiresAt: null, lastSeenAt: null, ...over });

describe('what a licence means today', () => {
  it('no licence at all', () => {
    expect(evaluateLicense(null, NOW).state).toBe('NONE');
  });

  it('active while the token is good', () => {
    const e = evaluateLicense(snap(new Date(NOW.getTime() + 20 * DAY)), NOW);
    expect(e.state).toBe('ACTIVE');
    expect(e.daysLeft).toBe(20);
  });

  it(`warns from ${WARN_DAYS} days out (connect to the internet to renew)`, () => {
    expect(evaluateLicense(snap(new Date(NOW.getTime() + (WARN_DAYS + 1) * DAY)), NOW).state).toBe('ACTIVE');
    expect(evaluateLicense(snap(new Date(NOW.getTime() + WARN_DAYS * DAY)), NOW).state).toBe('EXPIRING_SOON');
    expect(evaluateLicense(snap(new Date(NOW.getTime() + 1 * DAY)), NOW).state).toBe('EXPIRING_SOON');
  });

  it(`gives ${GRACE_DAYS} days of grace after the token ends, with everything still working`, () => {
    const ended = new Date(NOW.getTime() - 1 * DAY);
    expect(evaluateLicense(snap(ended), NOW).state).toBe('GRACE');
    const lastGraceDay = new Date(NOW.getTime() - GRACE_DAYS * DAY);
    expect(evaluateLicense(snap(lastGraceDay), NOW).state).toBe('GRACE');
  });

  it('lapses after the grace: back to the Free plan, as a lapsed cloud subscription does', () => {
    const ended = new Date(NOW.getTime() - (GRACE_DAYS + 1) * DAY);
    const e = evaluateLicense(snap(ended), NOW);
    expect(e.state).toBe('LAPSED');
    expect(planFieldsFor(e.state, 'PRO')).toEqual({ subscriptionStatus: 'EXPIRED' });
  });

  it('winding the clock back does not stretch a licence: time never runs earlier than the latest time seen', () => {
    const ended = new Date(NOW.getTime() - (GRACE_DAYS + 5) * DAY); // truly lapsed
    const cheat = new Date(NOW.getTime() - 60 * DAY); // owner sets the clock back two months
    const e = evaluateLicense(snap(ended, { lastSeenAt: NOW }), cheat);
    expect(e.state).toBe('LAPSED');
    expect(e.effectiveNow).toEqual(NOW);
    expect(e.clockBehind).toBe(true);
  });

  it('a clock that is only a little behind is not flagged (time zones, drift)', () => {
    const e = evaluateLicense(snap(new Date(NOW.getTime() + 20 * DAY), { lastSeenAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000) }), NOW);
    expect(e.clockBehind).toBe(false);
  });

  it('the server never issues a token longer than it promises', () => {
    expect(TOKEN_DAYS).toBe(30);
  });
});

describe('what is written to the business', () => {
  it('a working licence sets the plan, makes the account active and ends the trial', () => {
    for (const state of ['ACTIVE', 'EXPIRING_SOON', 'GRACE'] as const) {
      expect(planFieldsFor(state, 'PRO')).toEqual({ subscriptionTier: 'PRO', subscriptionStatus: 'ACTIVE', trialEndsAt: null, planName: 'Pro' });
    }
  });
  it('no licence changes nothing (the trial as registered stays)', () => {
    expect(planFieldsFor('NONE', 'PRO')).toBeNull();
  });
  it('LIFETIME is the top plan; an unknown plan is the Free plan', () => {
    expect(licenseTierToPlan('LIFETIME')).toBe('ENTERPRISE');
    expect(licenseTierToPlan('growth')).toBe('GROWTH');
    expect(licenseTierToPlan('PLATINUM')).toBe('FREE');
  });
});
