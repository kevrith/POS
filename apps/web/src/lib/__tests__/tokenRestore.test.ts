import { describe, it, expect, beforeEach, vi } from 'vitest';

/** A JWT with the given expiry (seconds). The signature is irrelevant to the client. */
const jwtExpiring = (inSeconds: number) => {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'none' })}.${enc({ exp: Math.floor(Date.now() / 1000) + inSeconds })}.sig`;
};

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('token restored after a page reload', () => {
  let calls: string[];

  beforeEach(() => {
    vi.resetModules();
    calls = [];
    vi.stubGlobal('sessionStorage', memoryStorage());
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', { location: { href: '/' } });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(JSON.stringify(String(url).includes('/auth/refresh') ? { accessToken: jwtExpiring(3600) } : { ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });

  it('reads the expiry from the token', async () => {
    const { tokenExpiryMs } = await import('../api');
    const t = jwtExpiring(3600);
    expect(Math.abs(tokenExpiryMs(t) - (Date.now() + 3600_000))).toBeLessThan(2000);
  });

  it('assumes 15 minutes for a token it cannot read', async () => {
    const { tokenExpiryMs } = await import('../api');
    expect(Math.abs(tokenExpiryMs('not-a-jwt') - (Date.now() + 15 * 60_000))).toBeLessThan(2000);
  });

  it('does NOT refresh a token that is good for an hour (this used to cost every page load a round trip)', async () => {
    sessionStorage.setItem('pos-access-token', jwtExpiring(3600)); // as after a reload: nothing in memory yet
    const { api } = await import('../api');
    await api.get('/items');
    expect(calls.some((u) => u.includes('/auth/refresh'))).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('refreshes once when the token is about to expire, and not again for the requests waiting behind it', async () => {
    sessionStorage.setItem('pos-access-token', jwtExpiring(60));
    const { api } = await import('../api');
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(calls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(1);
  });
});
