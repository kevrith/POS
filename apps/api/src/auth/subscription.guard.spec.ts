import { ForbiddenException } from '@nestjs/common';
import { Feature } from '@pos/shared';
import { SubscriptionGuard, SKIP_SUBSCRIPTION_CHECK, REQUIRES_FEATURE } from './subscription.guard';

const DAY = 24 * 60 * 60 * 1000;

function makeGuard(business: Record<string, unknown> | null, meta: Record<string, unknown> = {}) {
  const prisma: any = { business: { findUnique: jest.fn().mockResolvedValue(business) } };
  // The guard reads handler-then-class metadata, so the mock must answer the same
  // way a real Reflector does.
  const lookup = (key: string) =>
    key === SKIP_SUBSCRIPTION_CHECK ? meta[SKIP_SUBSCRIPTION_CHECK] : meta[REQUIRES_FEATURE];
  const reflector: any = {
    get: lookup,
    getAllAndOverride: (key: string) => lookup(key),
  };
  return new SubscriptionGuard(reflector, prisma);
}

function ctx(user: Record<string, unknown> | undefined = { businessId: 'biz-1' }) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

/** A feature no tier below GROWTH has, so the boundary is meaningful. */
const GATED = Feature.HOSPITALITY;

describe('SubscriptionGuard', () => {
  it('allows a tier that includes the feature', async () => {
    const guard = makeGuard(
      { subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'ACTIVE', trialEndsAt: null },
      { [REQUIRES_FEATURE]: GATED },
    );
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('blocks a tier that does not', async () => {
    const guard = makeGuard(
      { subscriptionTier: 'STARTER', subscriptionStatus: 'ACTIVE', trialEndsAt: null },
      { [REQUIRES_FEATURE]: GATED },
    );
    await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
  });

  it('accepts a title-case tier — a paid activation writes "Enterprise"', async () => {
    const guard = makeGuard(
      { subscriptionTier: 'Enterprise', subscriptionStatus: 'ACTIVE', trialEndsAt: null },
      { [REQUIRES_FEATURE]: GATED },
    );
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });

  describe('trials', () => {
    it('honours the tier while the trial is still running', async () => {
      const guard = makeGuard(
        {
          subscriptionTier: 'ENTERPRISE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 5 * DAY),
        },
        { [REQUIRES_FEATURE]: GATED },
      );
      await expect(guard.canActivate(ctx())).resolves.toBe(true);
    });

    it('drops to FREE once the trial date has passed', async () => {
      const guard = makeGuard(
        {
          subscriptionTier: 'ENTERPRISE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() - DAY),
        },
        { [REQUIRES_FEATURE]: GATED },
      );
      // Previously this kept every paid feature indefinitely, for free.
      await expect(guard.canActivate(ctx())).rejects.toThrow(/trial has ended/i);
    });

    it('still allows FREE-tier features after the trial ends', async () => {
      const guard = makeGuard(
        {
          subscriptionTier: 'ENTERPRISE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() - DAY),
        },
        { [REQUIRES_FEATURE]: Feature.POS },
      );
      // Expiry drops to FREE, not to nothing — the till keeps working.
      await expect(guard.canActivate(ctx())).resolves.toBe(true);
    });

    it('does not expire a paid subscription that happens to carry an old trial date', async () => {
      const guard = makeGuard(
        {
          subscriptionTier: 'ENTERPRISE',
          subscriptionStatus: 'ACTIVE',
          trialEndsAt: new Date(Date.now() - 90 * DAY),
        },
        { [REQUIRES_FEATURE]: GATED },
      );
      await expect(guard.canActivate(ctx())).resolves.toBe(true);
    });

    it('denies a trial with no end date instead of granting it forever', async () => {
      // Reversed deliberately. This used to pass, which meant a TRIAL row with no
      // trialEndsAt kept the whole product permanently — a trial that could never
      // expire because there was no date to compare against. effectiveTier now
      // fails closed: no end date, no trial. Registration always sets one, and no
      // production row was in this state when the behaviour changed.
      const guard = makeGuard(
        { subscriptionTier: 'ENTERPRISE', subscriptionStatus: 'TRIAL', trialEndsAt: null },
        { [REQUIRES_FEATURE]: GATED },
      );
      await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
    });

    it('denies a lapsed trial even once its status has been flipped to EXPIRED', async () => {
      // TrialExpiryService moves a finished trial from TRIAL to EXPIRED, which used
      // to defeat the expiry check here — it only looked for status TRIAL — so the
      // business silently kept its provisioned tier without ever paying.
      const guard = makeGuard(
        {
          subscriptionTier: 'ENTERPRISE',
          subscriptionStatus: 'EXPIRED',
          trialEndsAt: new Date(Date.now() - 30 * DAY),
        },
        { [REQUIRES_FEATURE]: GATED },
      );
      await expect(guard.canActivate(ctx())).rejects.toThrow(ForbiddenException);
    });

    it('grants the top tier while a trial is genuinely running', async () => {
      // A trial exists to evaluate the product, so the stored tier is irrelevant
      // until it ends.
      const guard = makeGuard(
        {
          subscriptionTier: 'FREE',
          subscriptionStatus: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 7 * DAY),
        },
        { [REQUIRES_FEATURE]: GATED },
      );
      await expect(guard.canActivate(ctx())).resolves.toBe(true);
    });
  });

  it('skips routes marked SkipSubscriptionCheck', async () => {
    const guard = makeGuard(null, { [SKIP_SUBSCRIPTION_CHECK]: true });
    await expect(guard.canActivate(ctx(undefined))).resolves.toBe(true);
  });

  it('allows routes that declare no feature requirement', async () => {
    const guard = makeGuard(null, {});
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
  });
});
