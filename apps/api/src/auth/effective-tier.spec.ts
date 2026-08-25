import { effectiveTier, isActiveTrial, SubscriptionTier, TRIAL_TIER } from '@pos/shared';

const NOW = new Date('2026-08-19T12:00:00Z');
const future = new Date('2026-09-08T12:00:00Z');
const past = new Date('2026-06-10T12:00:00Z');

describe('effectiveTier', () => {
  it('grants the trial tier while a trial is running', () => {
    expect(effectiveTier({ subscriptionTier: 'FREE', subscriptionStatus: 'TRIAL', trialEndsAt: future }, NOW))
      .toBe(TRIAL_TIER);
  });

  it('drops to FREE once the trial has ended', () => {
    expect(effectiveTier({ subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'TRIAL', trialEndsAt: past }, NOW))
      .toBe(SubscriptionTier.FREE);
  });

  it('treats a TRIAL with no end date as NOT active', () => {
    // Failing open here would hand out the whole product, forever, to any row
    // created without a trialEndsAt.
    expect(isActiveTrial({ subscriptionStatus: 'TRIAL', trialEndsAt: null }, NOW)).toBe(false);
    expect(effectiveTier({ subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'TRIAL', trialEndsAt: null }, NOW))
      .toBe(SubscriptionTier.FREE);
  });

  it('honours a paid tier on an active subscription', () => {
    expect(effectiveTier({ subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'ACTIVE', trialEndsAt: null }, NOW))
      .toBe(SubscriptionTier.ENTERPRISE);
    expect(effectiveTier({ subscriptionTier: 'GROWTH', subscriptionStatus: 'ACTIVE', trialEndsAt: null }, NOW))
      .toBe(SubscriptionTier.GROWTH);
  });

  it('gives an EXPIRED subscription no paid access whatever the tier says', () => {
    expect(effectiveTier({ subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'EXPIRED', trialEndsAt: past }, NOW))
      .toBe(SubscriptionTier.FREE);
  });

  it('normalises the stored tier rather than matching it verbatim', () => {
    expect(effectiveTier({ subscriptionTier: 'Enterprise', subscriptionStatus: 'ACTIVE' }, NOW))
      .toBe(SubscriptionTier.ENTERPRISE);
  });

  it('resolves the old "TRIAL" tier default to FREE rather than something invalid', () => {
    // subscriptionTier defaulted to the string "TRIAL", which is a status. Any row
    // still carrying it must fail closed.
    expect(effectiveTier({ subscriptionTier: 'TRIAL', subscriptionStatus: 'ACTIVE' }, NOW))
      .toBe(SubscriptionTier.FREE);
  });

  it('accepts an ISO string end date, as it arrives over JSON', () => {
    expect(effectiveTier({ subscriptionTier: 'FREE', subscriptionStatus: 'TRIAL', trialEndsAt: future.toISOString() }, NOW))
      .toBe(TRIAL_TIER);
  });
});
