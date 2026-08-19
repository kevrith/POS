import { planDisplayName, normalizeTier, SubscriptionTier } from '@pos/shared';

/**
 * planName is a display label. It must never disagree with subscriptionTier.
 *
 * A business reached production on tier ENTERPRISE labelled "Free". That mismatch
 * greyed out every paid feature in the UI and applied the free-tier transaction
 * cap to a paying customer, because both were reading the label rather than the
 * tier. These cover the derivation the write paths now depend on.
 */
describe('plan label derivation', () => {
  it('gives each tier its display label', () => {
    expect(planDisplayName('FREE')).toBe('Free');
    expect(planDisplayName('STARTER')).toBe('Starter');
    expect(planDisplayName('GROWTH')).toBe('Growth');
    expect(planDisplayName('PRO')).toBe('Pro');
    expect(planDisplayName('ENTERPRISE')).toBe('Enterprise');
  });

  it('tolerates whatever casing or padding the caller has', () => {
    // The admin console sent a raw upper-case tier; Paystack activation sent a
    // title-case name. Both must land on the same label.
    expect(planDisplayName('Enterprise')).toBe('Enterprise');
    expect(planDisplayName('enterprise')).toBe('Enterprise');
    expect(planDisplayName(' growth ')).toBe('Growth');
  });

  it('falls back to Free for anything unrecognised', () => {
    expect(planDisplayName('nonsense')).toBe('Free');
    expect(planDisplayName(undefined)).toBe('Free');
    expect(planDisplayName(null)).toBe('Free');
  });

  it('normalizes a tier for comparison instead of matching verbatim', () => {
    // The free-tier sales cap compared === 'FREE' and separately planName === 'Free'.
    expect(normalizeTier('Enterprise')).toBe(SubscriptionTier.ENTERPRISE);
    expect(normalizeTier('free')).toBe(SubscriptionTier.FREE);
    expect(normalizeTier(undefined)).toBe(SubscriptionTier.FREE);
  });

  it('never produces a label that disagrees with its own tier', () => {
    for (const tier of Object.values(SubscriptionTier)) {
      // Round-trip: label -> tier -> label must be stable.
      const label = planDisplayName(tier);
      expect(normalizeTier(label)).toBe(normalizeTier(tier));
    }
  });
});
