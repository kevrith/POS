import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (d: Record<string, unknown>) => void;

// A fake socket.io client that remembers its listeners so the test can fire server events at it.
const sockets: Array<{ listeners: Map<string, Set<Handler>>; emit: (e: string, d?: Record<string, unknown>) => void }> = [];
vi.mock('socket.io-client', () => ({
  io: () => {
    const listeners = new Map<string, Set<Handler>>();
    const s = {
      listeners,
      connected: false,
      on(e: string, h: Handler) { (listeners.get(e) ?? listeners.set(e, new Set()).get(e)!).add(h); return s; },
      off(e: string, h: Handler) { listeners.get(e)?.delete(h); return s; },
      emit: (e: string, d: Record<string, unknown> = {}) => { listeners.get(e)?.forEach((h) => h(d)); },
      removeAllListeners() { listeners.clear(); return s; },
      disconnect() { return s; },
    };
    sockets.push(s);
    return s;
  },
}));

// socket.ts asks api.ts which server to connect to; api.ts needs a browser, so give it a fixed answer here.
vi.mock('../api', () => ({ getApiUrl: () => '/api/v1' }));

import { connectSocket, disconnectSocket, subscribeToEvent } from '../socket';

describe('subscribeToEvent', () => {
  beforeEach(() => { disconnectSocket(); sockets.length = 0; });

  it('keeps a subscription made BEFORE the socket exists and delivers to it once connected', () => {
    const got = vi.fn();
    subscribeToEvent('sale_created', got); // a page mounts and subscribes first...
    connectSocket('t', 'biz-1');           // ...the socket opens a moment later
    sockets[0].emit('sale_created', { saleId: 's1' });
    expect(got).toHaveBeenCalledWith({ saleId: 's1' });
  });

  it('delivers to a subscription made after the socket exists', () => {
    connectSocket('t', 'biz-1');
    const got = vi.fn();
    subscribeToEvent('sale_created', got);
    sockets[0].emit('sale_created', { saleId: 's2' });
    expect(got).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    connectSocket('t', 'biz-1');
    const got = vi.fn();
    const off = subscribeToEvent('sale_created', got);
    off();
    sockets[0].emit('sale_created', {});
    expect(got).not.toHaveBeenCalled();
  });

  it('re-attaches live subscriptions to a replacement socket (sign out and in, another business)', () => {
    const got = vi.fn();
    connectSocket('t', 'biz-1');
    subscribeToEvent('sale_created', got);
    disconnectSocket();
    connectSocket('t2', 'biz-2');
    sockets[1].emit('sale_created', { saleId: 's3' });
    expect(got).toHaveBeenCalledWith({ saleId: 's3' });
  });
});
