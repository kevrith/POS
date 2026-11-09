/**
 * Creating the owner's account from the setup wizard, on the server this computer has just started.
 *
 * Pure of screens and of the real network (fetch and the clock are passed in), so the waiting, the refusals and the wording
 * are tested directly. The wizard uses these after it starts the local server.
 */
import type { LocalServerStatus } from './desktopServer';
import type { AuthUser } from '../stores/auth';

export interface WaitOptions {
  /** Give up after this long. A first start creates the database, so it is generous. */
  timeoutMs?: number;
  intervalMs?: number;
  /** Called with the server's own words ("Creating your database...") each time they change. */
  onProgress?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Wait until the local server is running and return its status (which carries the port it really took). */
export async function waitForLocalServer(getStatus: () => Promise<LocalServerStatus>, o: WaitOptions = {}): Promise<LocalServerStatus> {
  const { timeoutMs = 4 * 60_000, intervalMs = 1000, onProgress } = o;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const started = now();
  let last = '';
  for (;;) {
    let status: LocalServerStatus | null = null;
    try { status = await getStatus(); } catch { /* the desktop app may not answer for a moment while it starts the server */ }
    if (status) {
      if (status.message && status.message !== last) { last = status.message; onProgress?.(status.message); }
      if (status.phase === 'running' && status.apiPort) return status;
      if (status.phase === 'error') throw new Error(status.message || 'The server could not start.');
    }
    if (now() - started > timeoutMs) throw new Error('The server is taking too long to start.');
    await sleep(intervalMs);
  }
}

export interface OwnerDetails {
  name: string;
  email: string;
  password: string;
  businessName: string;
}

/** Turn what the server answered into a sentence a shop owner can act on. */
export function registerFailure(status: number, serverMessage: string | undefined): string {
  if (status === 409) return 'An account with this email already exists on this computer. Sign in with it instead.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (serverMessage && status >= 400 && status < 500) return serverMessage;
  return 'The server could not create the account.';
}

/**
 * Create the business and its owner on the server at `baseUrl` (for example http://127.0.0.1:3010) and return the signed-in
 * user. The store id is looked up so the till opens ready to sell, exactly as signing in through the login screen does.
 */
export async function registerOwner(
  baseUrl: string,
  d: OwnerDetails,
  fetchFn: typeof fetch = (input, init) => fetch(input, init),
): Promise<{ accessToken: string; user: AuthUser }> {
  const api = `${baseUrl.replace(/\/$/, '')}/api/v1`;
  const res = await fetchFn(`${api}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: d.name.trim(), email: d.email.trim(), password: d.password, businessName: d.businessName.trim() }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(registerFailure(res.status, body.message));
  }
  const data = (await res.json()) as { accessToken: string; user: AuthUser };
  const user = { ...data.user };
  if (!user.storeId) {
    try {
      const stores = await fetchFn(`${api}/business/${user.businessId}/stores`, { headers: { Authorization: `Bearer ${data.accessToken}` } });
      if (stores.ok) {
        const list = (await stores.json()) as Array<{ id: string }>;
        if (list.length > 0) user.storeId = list[0].id;
      }
    } catch { /* not fatal: the till finds its store at sign-in */ }
  }
  return { accessToken: data.accessToken, user };
}
