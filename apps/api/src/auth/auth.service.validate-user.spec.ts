import { AuthService, JwtPayload } from './auth.service';
import { UserRole } from '@pos/shared';

/**
 * Regression cover for the plan fields on AuthUser.
 *
 * validateUser builds the object returned by GET /auth/me and attached to every
 * authenticated request. It used to return planName alone, which quietly locked
 * paid features in the UI for customers the API was authorising: planName is a
 * display label that drifts, and an account gifted ENTERPRISE from the admin
 * console keeps planName "Free". The browser fell back to it and resolved FREE.
 */
function makeService(user: Record<string, unknown> | null) {
  const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  return {
    service: new AuthService(prisma, {} as any, {} as any, {} as any),
    prisma,
  };
}

const payload: JwtPayload = {
  sub: 'user-1',
  businessId: 'biz-1',
  role: UserRole.OWNER,
};

const baseUser = {
  id: 'user-1',
  name: 'Kelvin',
  email: 'owner@example.com',
  role: 'OWNER',
  businessId: 'biz-1',
};

describe('AuthService.validateUser — plan fields', () => {
  it('returns the live subscriptionTier from the business', async () => {
    const { service } = makeService({
      ...baseUser,
      business: { planName: 'Free', subscriptionTier: 'ENTERPRISE' },
    });

    const user = await service.validateUser(payload);

    // The exact production case: tier paid for, label stale.
    expect(user?.subscriptionTier).toBe('ENTERPRISE');
    expect(user?.planName).toBe('Free');
  });

  it('prefers the business tier over a stale tier in the token', async () => {
    const { service } = makeService({
      ...baseUser,
      business: { planName: 'Pro', subscriptionTier: 'PRO' },
    });

    const user = await service.validateUser({ ...payload, subscriptionTier: 'FREE' });

    // A plan change must take effect without waiting for tokens to expire.
    expect(user?.subscriptionTier).toBe('PRO');
  });

  it('falls back to the token when the business has no tier set', async () => {
    const { service } = makeService({
      ...baseUser,
      business: { planName: null, subscriptionTier: null },
    });

    const user = await service.validateUser({ ...payload, subscriptionTier: 'GROWTH' });

    expect(user?.subscriptionTier).toBe('GROWTH');
  });

  it('loads the business alongside the user in one query', async () => {
    const { service, prisma } = makeService({
      ...baseUser,
      business: { planName: 'Free', subscriptionTier: 'ENTERPRISE' },
    });

    await service.validateUser(payload);

    // Guards against a refactor that drops the include and silently reintroduces
    // the bug — the fields would just come back undefined.
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          business: {
            select: {
              planName: true, subscriptionTier: true,
              subscriptionStatus: true, trialEndsAt: true,
            },
          },
        },
      }),
    );
  });

  it('returns null for an unknown user', async () => {
    const { service } = makeService(null);
    await expect(service.validateUser(payload)).resolves.toBeNull();
  });
});
