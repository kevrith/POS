/**
 * Print bridge: delivers queued print jobs to LAN printers from a till that is ON the shop network.
 *
 * A cloud API cannot open a connection to 192.168.x.x, so it queues the job and a till running the desktop app
 * (which can) claims it, writes the bytes to the printer's port 9100 through the Tauri `print_to_network`
 * command, and reports the result. The server decides what is claimable and retries failures with a delay, so
 * several tills can run the bridge at once without printing a job twice.
 */
import api from './api';
import { isDesktopApp } from './desktopPrinter';

const ID_KEY = 'print-bridge-id';
const ENABLED_KEY = 'print-bridge-enabled';
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

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return typeof err === 'string' && err ? err : 'The printer did not respond';
}

/** Deliver one claimed job and tell the server how it went. */
async function deliver(job: ClaimedJob, invoke: Invoke, id: string): Promise<void> {
  let ok = false;
  let error: string | undefined;
  try {
    await invoke<boolean>('print_to_network', { host: job.host, port: job.port, dataBase64: job.data });
    ok = true;
  } catch (err) {
    error = errorText(err);
  }
  await api.post(`/print-jobs/${job.id}/result`, { bridgeId: id, ok, error }).catch(() => undefined);
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
      const storeId = getStoreId();
      if (!stopped && isActive() && storeId && document.visibilityState !== 'hidden') {
        const jobs = await api.post<ClaimedJob[]>('/print-jobs/claim', { storeId, bridgeId: id, limit: 5 });
        for (const job of jobs) await deliver(job, invoke, id);
      } else {
        next = IDLE_BACKOFF_MS;
      }
    } catch {
      // Offline or signed out: try again later, quietly.
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
