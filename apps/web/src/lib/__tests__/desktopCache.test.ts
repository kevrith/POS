import { describe, expect, it, vi } from 'vitest';
import { dropOfflineShell, type CacheEnv } from '../desktopCache';

function env(over: Partial<CacheEnv> & { controlled?: boolean; registrations?: number; cacheKeys?: string[] } = {}) {
  let flagged: string | null = null;
  const unregister = vi.fn(async () => true);
  const deleted: string[] = [];
  const reload = vi.fn();
  const e: CacheEnv = {
    serviceWorker: { controller: over.controlled ? {} : null, getRegistrations: async () => Array.from({ length: over.registrations ?? 0 }, () => ({ unregister })) },
    caches: { keys: async () => over.cacheKeys ?? [], delete: async (k) => (deleted.push(k), true) },
    flag: { get: () => flagged, set: () => { flagged = '1'; } },
    reload,
    ...over,
  };
  return { e, unregister, deleted, reload };
}

describe('dropping the offline copy in the desktop app', () => {
  it('removes the worker and every saved copy, and reloads once when the worker was serving this page', async () => {
    const { e, unregister, deleted, reload } = env({ controlled: true, registrations: 2, cacheKeys: ['workbox-precache-v2', 'api-data-cache'] });
    expect(await dropOfflineShell(e)).toEqual({ unregistered: 2, cachesDeleted: 2, reloaded: true });
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleted).toEqual(['workbox-precache-v2', 'api-data-cache']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads twice in one window, so a failure cannot loop', async () => {
    const { e, reload } = env({ controlled: true, registrations: 1 });
    await dropOfflineShell(e);
    await dropOfflineShell(e);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when no worker was serving the page (a clean install, or already cleaned)', async () => {
    const { e, reload } = env({ controlled: false });
    expect(await dropOfflineShell(e)).toEqual({ unregistered: 0, cachesDeleted: 0, reloaded: false });
    expect(reload).not.toHaveBeenCalled();
  });

  it('still reloads to the fresh screens when the worker was in charge but cleaning up half-failed', async () => {
    const { e, reload } = env({ controlled: true });
    e.caches = { keys: async () => { throw new Error('blocked'); }, delete: async () => true };
    expect((await dropOfflineShell(e)).reloaded).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('copes with a webview that has no service worker or cache support', async () => {
    const reload = vi.fn();
    expect(await dropOfflineShell({ flag: { get: () => null, set: () => undefined }, reload })).toEqual({ unregistered: 0, cachesDeleted: 0, reloaded: false });
    expect(reload).not.toHaveBeenCalled();
  });
});
