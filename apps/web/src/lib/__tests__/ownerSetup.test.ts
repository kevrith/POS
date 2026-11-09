import { describe, expect, it, vi } from 'vitest';
import { registerFailure, registerOwner, waitForLocalServer } from '../ownerSetup';
import type { LocalServerStatus } from '../desktopServer';

const st = (phase: LocalServerStatus['phase'], message: string, apiPort?: number): LocalServerStatus => ({ phase, message, apiPort, addresses: [] });

describe('waiting for the local server', () => {
  it('returns once it runs, and reports each new message once', async () => {
    const answers = [st('starting', 'Creating your database'), st('starting', 'Creating your database'), st('starting', 'Starting'), st('running', 'Running', 3010)];
    const seen: string[] = [];
    const out = await waitForLocalServer(async () => answers.shift() as LocalServerStatus, { sleep: async () => undefined, onProgress: (m) => seen.push(m) });
    expect(out.apiPort).toBe(3010);
    expect(seen).toEqual(['Creating your database', 'Starting', 'Running']);
  });

  it('survives the desktop app not answering for a moment', async () => {
    let n = 0;
    const out = await waitForLocalServer(async () => { if (++n < 3) throw new Error('busy'); return st('running', 'Running', 3011); }, { sleep: async () => undefined });
    expect(out.apiPort).toBe(3011);
  });

  it('stops at once with the server\'s own words when it fails', async () => {
    await expect(waitForLocalServer(async () => st('error', 'The database did not start.'), { sleep: async () => undefined })).rejects.toThrow('The database did not start.');
  });

  it('gives up after the time allowed', async () => {
    let t = 0;
    await expect(waitForLocalServer(async () => st('starting', 'Starting'), { timeoutMs: 5000, sleep: async () => undefined, now: () => (t += 2000) })).rejects.toThrow(/too long/);
  });
});

describe('registering the owner', () => {
  const details = { name: ' Amina ', email: ' amina@shop.test ', password: 'Goodpass1', businessName: ' Premier Cafe ' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('creates the account on the given server and finds the store', async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).endsWith('/auth/register')) {
        expect(JSON.parse(String(init?.body))).toEqual({ name: 'Amina', email: 'amina@shop.test', password: 'Goodpass1', businessName: 'Premier Cafe' });
        return json(201, { accessToken: 'tok', user: { id: 'u1', name: 'Amina', role: 'OWNER', businessId: 'b1' } });
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return json(200, [{ id: 's1' }]);
    }) as unknown as typeof fetch;
    const out = await registerOwner('http://127.0.0.1:3010/', details, fetchFn);
    expect(calls).toEqual(['http://127.0.0.1:3010/api/v1/auth/register', 'http://127.0.0.1:3010/api/v1/business/b1/stores']);
    expect(out.accessToken).toBe('tok');
    expect(out.user.storeId).toBe('s1');
  });

  it('still succeeds when the store cannot be looked up', async () => {
    const fetchFn = (async (url: string | URL | Request) => String(url).endsWith('/auth/register')
      ? json(201, { accessToken: 'tok', user: { id: 'u1', role: 'OWNER', businessId: 'b1' } })
      : json(500, {})) as unknown as typeof fetch;
    const out = await registerOwner('http://x', details, fetchFn);
    expect(out.user.storeId).toBeUndefined();
  });

  it('turns refusals into sentences', async () => {
    const refuse = (status: number, message?: string) => (async () => json(status, message ? { message } : {})) as unknown as typeof fetch;
    await expect(registerOwner('http://x', details, refuse(409))).rejects.toThrow(/already exists/);
    await expect(registerOwner('http://x', details, refuse(400, 'Password too weak'))).rejects.toThrow('Password too weak');
    await expect(registerOwner('http://x', details, refuse(500, 'stack trace here'))).rejects.toThrow('The server could not create the account.');
  });

  it('never repeats a server\'s internal error text', () => {
    expect(registerFailure(502, 'ECONNREFUSED 10.0.0.1')).toBe('The server could not create the account.');
  });
});
