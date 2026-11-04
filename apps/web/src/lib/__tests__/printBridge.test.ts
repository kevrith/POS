import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiPost = vi.fn();
vi.mock('../api', () => ({ default: { post: apiPost }, getApiUrl: () => 'https://api.test/api/v1' }));

const invoke = vi.fn();
const store = new Map<string, string>();
const events: string[] = [];
vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke }, dispatchEvent: (e: Event) => { events.push(e.type); return true; } });
vi.stubGlobal('document', { visibilityState: 'visible' });
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
});
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const bridge = await import('../printBridge');

const job = { id: 'j1', kind: 'RECEIPT', data: 'QUJD', host: '192.168.1.50', port: 9100 };
const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });

async function runOneRound(storeId: string | null = 's1') {
  const stop = bridge.startPrintBridge(() => storeId ?? undefined);
  await vi.advanceTimersByTimeAsync(3100);
  stop();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  store.clear();
  events.length = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe('print bridge with a station token', () => {
  it('claims with the token (no login), writes to the printer, and reports success', async () => {
    bridge.setStationToken('pst_abc');
    fetchMock.mockResolvedValueOnce(jsonResponse([job])).mockResolvedValueOnce(jsonResponse({ status: 'SENT' }));
    invoke.mockResolvedValue(true);

    await runOneRound(null);

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/v1/print-bridge/claim');
    expect(fetchMock.mock.calls[0][1].headers['x-print-station-token']).toBe('pst_abc');
    expect(invoke).toHaveBeenCalledWith('print_to_network', { host: '192.168.1.50', port: 9100, dataBase64: 'QUJD' });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/api/v1/print-bridge/j1/result');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ok: true });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('reports the printer error back so the server can retry', async () => {
    bridge.setStationToken('pst_abc');
    fetchMock.mockResolvedValueOnce(jsonResponse([job])).mockResolvedValueOnce(jsonResponse({ status: 'QUEUED' }));
    invoke.mockRejectedValue('Cannot connect to printer: connection refused');

    await runOneRound();

    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ ok: false, error: 'Cannot connect to printer: connection refused' });
  });

  it('forgets a token the server rejects, so a removed station stops asking', async () => {
    bridge.setStationToken('pst_revoked');
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    await runOneRound();
    expect(bridge.getStationToken()).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the token through a network error', async () => {
    bridge.setStationToken('pst_abc');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await runOneRound();
    expect(bridge.getStationToken()).toBe('pst_abc');
  });

  it('tells the app when the token changes so the loop restarts', () => {
    bridge.setStationToken('pst_abc');
    bridge.setStationToken(null);
    expect(events).toEqual([bridge.BRIDGE_CONFIG_EVENT, bridge.BRIDGE_CONFIG_EVENT]);
  });
});

describe('print bridge without a token', () => {
  it('falls back to the signed-in person\'s login', async () => {
    apiPost.mockResolvedValueOnce([job]).mockResolvedValueOnce({ status: 'SENT' });
    invoke.mockResolvedValue(true);
    await runOneRound('s1');
    expect(apiPost.mock.calls[0][0]).toBe('/print-jobs/claim');
    expect(apiPost.mock.calls[0][1]).toEqual(expect.objectContaining({ storeId: 's1', limit: 5 }));
    expect(apiPost.mock.calls[1][0]).toBe('/print-jobs/j1/result');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing with neither a token nor a store, and when the owner switched it off', async () => {
    await runOneRound(null);
    bridge.setBridgeEnabled(false);
    await runOneRound('s1');
    expect(apiPost).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
