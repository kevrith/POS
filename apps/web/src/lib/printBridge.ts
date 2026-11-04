/**
 * Print bridge: delivers queued print jobs to LAN printers from a till that is ON the shop network.
 *
 * A cloud API cannot open a connection to 192.168.x.x, so it queues the job and a till running the desktop app
 * (which can) claims it, writes the bytes to the printer's port 9100 through the Tauri `print_to_network`
 * command, and reports the result. The server decides what is claimable and retries failures with a delay, so
 * several tills can run the bridge at once without printing a job twice.
 *
 * Two ways to authenticate. A STATION TOKEN (Settings -> Printers -> Print stations) is long-lived and needs no
 * one signed in, so a till or small computer by the printers can deliver all day. Without a token the bridge
 * falls back to the signed-in person's login, which expires.
 */
import api, { getApiUrl } from './api';
import { isDesktopApp } from './desktopPrinter';

const ID_KEY = 'print-bridge-id';
const ENABLED_KEY = 'print-bridge-enabled';
const TOKEN_KEY = 'print-station-token';
const POLL_MS = 3000;
const IDLE_BACKOFF_MS = 15000;

interface ClaimedJob {
  id: string;
  kind: string;
  data: string;
  host: string;
  port: number;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): Invoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke?: Invoke }; __TAURI__?: { invoke?: Invoke } };
  return w.__TAURI_INTERNALS__?.invoke ?? w.__TAURI__?.invoke ?? null;
}

/** A stable id for this till, so a claim can be told apart from another till's. */
export function bridgeId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return 'till-' + Math.random().toString(36).slice(2);
  }
}

/** The bridge runs on the desktop app unless the owner switched it off on this till. */
export function isBridgeEnabled(): boolean {
  if (!isDesktopApp()) return false;
  try { return localStorage.getItem(ENABLED_KEY) !== '0'; } catch { return true; }
}

export function setBridgeEnabled(on: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}

export function getStationToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export const BRIDGE_CONFIG_EVENT = 'print-bridge-config';

export function setStationToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable */ }
  try { window.dispatchEvent(new Event(BRIDGE_CONFIG_EVENT)); } catch { /* not in a browser */ }
}

class StationTokenRejected extends Error {}

/** Talk to the station endpoints with the token. A 401 means the station was revoked. */
async function stationPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${getApiUrl()}/print-bridge${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-print-station-token': token },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new StationTokenRejected('This print station was removed');
  if (!res.ok) throw new Error(`Print server error ${res.status}`);
  return (await res.json()) as T;
}

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === 'string' && err ? err : 'The printer did not respond';
}

/** Deliver one claimed job and tell the server how it went. */
async function deliver(job: ClaimedJob, invoke: Invoke, report: (jobId: string, ok: boolean, error?: string) => Promise<void>): Promise<void> {
  let ok = false;
  let error: string | undefined;
  try {
    await invoke<boolean>('print_to_network', { host: job.host, port: job.port, dataBase64: job.data });
    ok = true;
  } catch (err) {
    error = errorText(err);
  }
  await report(job.id, ok, error).catch(() => undefined);
}

/**
 * Start polling. Returns a function that stops it. `isActive` is checked every round, so signing out or
 * switching the bridge off ends the loop without leaving a timer behind.
 */
export function startPrintBridge(getStoreId: () => string | undefined, isActive: () => boolean = isBridgeEnabled): () => void {
  const invoke = getInvoke();
  if (!invoke) return () => undefined;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const id = bridgeId();

  const tick = async () => {
    let next = POLL_MS;
    try {
      const token = getStationToken();
      const storeId = getStoreId();
      const visible = document.visibilityState !== 'hidden';
      if (!stopped && isActive() && visible && token) {
        const jobs = await stationPost<ClaimedJob[]>('/claim', token, { limit: 5 });
        for (const job of jobs) {
          await deliver(job, invoke, (jobId, ok, error) => stationPost(`/${jobId}/result`, token, { ok, error }).then(() => undefined));
        }
      } else if (!stopped && isActive() && visible && storeId) {
        const jobs = await api.post<ClaimedJob[]>('/print-jobs/claim', { storeId, bridgeId: id, limit: 5 });
        for (const job of jobs) {
          await deliver(job, invoke, (jobId, ok, error) => api.post(`/print-jobs/${jobId}/result`, { bridgeId: id, ok, error }).then(() => undefined));
        }
      } else {
        next = IDLE_BACKOFF_MS;
      }
    } catch (err) {
      // A revoked station must stop using its token; anything else (offline, server restarting) is retried quietly.
      if (err instanceof StationTokenRejected) setStationToken(null);
      next = IDLE_BACKOFF_MS;
    }
    if (!stopped) timer = setTimeout(() => void tick(), next);
  };

  timer = setTimeout(() => void tick(), POLL_MS);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
