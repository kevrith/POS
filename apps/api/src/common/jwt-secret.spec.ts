import { jwtSecret } from './jwt-secret';

describe('jwtSecret', () => {
  const strong = 'k3Jf9sLw2Qe8Rz1TyUiOp7Nm4Bv6Cx0Aa5Sd';

  it('refuses to start without a secret, in every environment', () => {
    expect(() => jwtSecret({})).toThrow(/JWT_SECRET is not set/);
    expect(() => jwtSecret({ JWT_SECRET: '   ' })).toThrow(/not set/);
    expect(() => jwtSecret({ NODE_ENV: 'development' })).toThrow(/not set/);
  });

  it('returns the configured secret', () => {
    expect(jwtSecret({ JWT_SECRET: strong })).toBe(strong);
    expect(jwtSecret({ JWT_SECRET: 'short-but-ok-in-dev' })).toBe('short-but-ok-in-dev');
  });

  it('in production rejects short secrets and the placeholders that are public in the repo', () => {
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'tooshort' })).toThrow(/too short/);
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'dev-secret-change-in-production' })).toThrow(/placeholder/);
    expect(() => jwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'change-me-to-a-random-256-bit-secret-min-32-chars' })).toThrow(/placeholder/);
    expect(jwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });
});
