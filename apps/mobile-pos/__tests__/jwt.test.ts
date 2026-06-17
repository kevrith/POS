import { secondsUntilExpiry, decodeB64 } from '../lib/jwt';

/** Build a fake JWT (header.payload.signature) with the given exp claim. */
function makeToken(exp: number): string {
  const payload = Buffer.from(JSON.stringify({ exp, sub: 'u1' }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

describe('secondsUntilExpiry', () => {
  const now = 1_700_000_000_000; // fixed clock

  it('returns a positive value for a token that expires in the future', () => {
    const token = makeToken(now / 1000 + 600); // +10 min
    expect(secondsUntilExpiry(token, now)).toBe(600);
  });

  it('returns a negative value for an expired token', () => {
    const token = makeToken(now / 1000 - 60); // -1 min
    expect(secondsUntilExpiry(token, now)).toBe(-60);
  });

  it('crosses the proactive-refresh threshold correctly (<120s)', () => {
    const soon = makeToken(now / 1000 + 90); // 90s left
    expect(secondsUntilExpiry(soon, now)).toBeLessThanOrEqual(120);
    expect(secondsUntilExpiry(soon, now)).toBeGreaterThan(0);
  });

  it('returns null for a malformed token', () => {
    expect(secondsUntilExpiry('not-a-jwt', now)).toBeNull();
    expect(secondsUntilExpiry('', now)).toBeNull();
  });

  it('returns null when there is no exp claim', () => {
    const noExp = `h.${Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64')}.s`;
    expect(secondsUntilExpiry(noExp, now)).toBeNull();
  });
});

describe('decodeB64', () => {
  it('round-trips a base64-encoded JSON payload', () => {
    const json = JSON.stringify({ a: 1, name: 'Kelvin' });
    const b64 = Buffer.from(json).toString('base64');
    expect(decodeB64(b64)).toBe(json);
  });
});
