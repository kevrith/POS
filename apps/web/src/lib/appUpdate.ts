/**
 * Updating the desktop app: the checks and the install are done by the desktop program (src-tauri/src/app_update.rs); this
 * file is the web side. A newer version is looked for a little after start-up and every few hours, and the owner decides when
 * to install it, because installing closes the app (and the shop's server) for a minute.
 *
 * Nothing here talks to the API, so it also works on a till whose server is down. Outside the desktop app everything is a no-op.
 */
import { create } from 'zustand';
import { call, inDesktopApp } from './desktopServer';
import { KASTRA_CLOUD_API } from './cloudUrl';
import { isPrivateAddress } from './storeLink';

export interface AppUpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string | null;
  date?: string | null;
}

/** `stage` is idle until an install starts, then downloading, stopping (the shop's server), installing, or error. */
export interface UpdateProgress {
  stage: 'idle' | 'downloading' | 'stopping' | 'installing' | 'error';
  downloaded: number;
  total?: number | null;
  error?: string | null;
}

const IDLE: UpdateProgress = { stage: 'idle', downloaded: 0 };

/** Only the people who run the shop decide when the whole app closes; a cashier mid-sale must not. */
export const canInstallUpdate = (role?: string): boolean => role === 'OWNER' || role === 'MANAGER';

export const isInstalling = (p: UpdateProgress): boolean => p.stage === 'downloading' || p.stage === 'stopping' || p.stage === 'installing';

export function percentDone(p: UpdateProgress): number | null {
  if (p.stage !== 'downloading' || !p.total) return null;
  return Math.min(100, Math.floor((p.downloaded / p.total) * 100));
}

/** One line for the banner while an install is running. */
export function describeProgress(p: UpdateProgress): string {
  switch (p.stage) {
    case 'downloading': {
      const pct = percentDone(p);
      return pct === null ? 'Downloading the update' : `Downloading the update, ${pct}%`;
    }
    case 'stopping':
      return 'Saving your data before the update';
    case 'installing':
      return 'Installing. KASTRA will restart by itself in a moment';
    case 'error':
      return p.error || 'The update did not finish. Nothing was changed.';
    default:
      return '';
  }
}

/** How long ago a check was made, for the "last checked" line. */
export function checkedAgo(at: number | undefined, now = Date.now()): string {
  if (!at) return 'not yet';
  const minutes = Math.floor((now - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

const asMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface AppUpdateState {
  version?: string;
  found: AppUpdateInfo | null;
  checking: boolean;
  checkedAt?: number;
  /** Set only by a check the owner asked for: a failed background check (no internet) stays quiet. */
  checkError?: string;
  progress: UpdateProgress;
  /** "Later" hides the banner until the next check finds it again. */
  dismissed: boolean;
  /** The platform admin asked this computer to update: the banner stays, and "Later" is not offered. */
  requested: boolean;
  check: (manual?: boolean) => Promise<void>;
  install: () => Promise<void>;
  /**
   * Pick up an install that is already running. The download belongs to the desktop program, not to this page, so a
   * refresh (or a new window) leaves it going while the page forgets it: this asks the program and follows it again.
   */
  resume: () => Promise<void>;
  /** Tell the KASTRA server which version this computer runs, and learn whether an update has been requested. */
  report: () => Promise<void>;
  dismiss: () => void;
}

let polling = false;

/** What the desktop program answers when an install is already running (see app_update_install). */
const ALREADY_RUNNING = /already being installed/i;

/** Follow a running install until it fails or the program restarts for the update. */
function followInstall(): void {
  if (polling) return;
  polling = true;
  const tick = async () => {
    try {
      const p = await call<UpdateProgress>('app_update_status');
      useAppUpdate.setState({ progress: p });
      if (p.stage === 'error' || p.stage === 'idle') {
        polling = false;
        return;
      }
    } catch {
      // The program is restarting for the update: keep waiting, there is nothing to show but the last stage.
    }
    setTimeout(tick, 700);
  };
  void tick();
}

export const useAppUpdate = create<AppUpdateState>((set, get) => ({
  found: null,
  checking: false,
  progress: IDLE,
  dismissed: false,
  requested: false,

  check: async (manual = false) => {
    if (!inDesktopApp() || get().checking || isInstalling(get().progress)) return;
    set({ checking: true, checkError: undefined });
    try {
      if (!get().version) set({ version: await call<string>('app_version') });
      const found = await call<AppUpdateInfo | null>('app_update_check');
      // The same version found again keeps "Later" in force; a newer one shows the banner again.
      set((s) => ({ found, checkedAt: Date.now(), dismissed: found && s.found?.version === found.version ? s.dismissed : false }));
    } catch (e) {
      set({ checkedAt: Date.now(), checkError: manual ? asMessage(e) : undefined });
    } finally {
      set({ checking: false });
    }
  },

  install: async () => {
    if (!inDesktopApp() || isInstalling(get().progress)) return;
    set({ progress: { stage: 'downloading', downloaded: 0 } });
    try {
      await call<void>('app_update_install');
    } catch (e) {
      // Already running (the page was refreshed mid-download): that is not a failure, join it.
      if (ALREADY_RUNNING.test(asMessage(e))) {
        followInstall();
        return;
      }
      set({ progress: { ...IDLE, stage: 'error', error: asMessage(e) } });
      return;
    }
    // The desktop program does the work in the background; follow it until it fails. On success it ends this program.
    followInstall();
  },

  resume: async () => {
    if (!inDesktopApp() || isInstalling(get().progress)) return;
    try {
      const p = await call<UpdateProgress>('app_update_status');
      if (isInstalling(p)) {
        set({ progress: p });
        followInstall();
      }
    } catch {
      // No answer from the desktop program: nothing to resume.
    }
  },

  report: async () => {
    if (!inDesktopApp()) return;
    try {
      const [machine, version] = await Promise.all([
        call<{ machine_id: string; hostname: string }>('get_machine_id'),
        call<string>('app_version'),
      ]);
      if (!get().version) set({ version });
      const answer = await postHeartbeat(heartbeatBody(machine, version));
      if (!answer) return;
      set({ requested: answer.updateRequested });
      // Asked to update: find the update now rather than waiting for the next scheduled check.
      if (answer.updateRequested && !get().found) void get().check();
    } catch {
      // Offline or the server is asleep: nothing to report right now, try again at the next check.
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

/** Which server to report to: the cloud, or the cloud again when this computer's own server is on its own premises. */
export function heartbeatBase(serverUrl: string | null): string {
  if (serverUrl && !isPrivateAddress(serverUrl)) return serverUrl.replace(/\/+$/, '') + '/api/v1';
  return KASTRA_CLOUD_API;
}

export function systemName(userAgent: string): string {
  if (/windows/i.test(userAgent)) return 'windows';
  if (/mac os|macintosh/i.test(userAgent)) return 'macos';
  if (/linux/i.test(userAgent)) return 'linux';
  return 'unknown';
}

/** What this computer tells the server about itself. Nothing from the shop's sales or customers. */
export function heartbeatBody(
  machine: { machine_id: string; hostname: string },
  appVersion: string,
  extra: { businessId?: string; businessName?: string; userAgent?: string } = {},
) {
  return {
    machineId: machine.machine_id,
    hostname: machine.hostname,
    os: systemName(extra.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)),
    appVersion,
    businessId: extra.businessId ?? signedInBusinessId(),
    businessName: extra.businessName ?? safeStored('desktop-business-name') ?? undefined,
  };
}

/** The business of whoever is signed in, read from where the sign-in is kept (this file must not load the sign-in code). */
function signedInBusinessId(): string | undefined {
  try {
    const saved = JSON.parse(sessionStorage.getItem('pos-auth') ?? 'null') as { state?: { user?: { businessId?: string } } } | null;
    return saved?.state?.user?.businessId;
  } catch {
    return undefined;
  }
}

function safeStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

async function postHeartbeat(body: ReturnType<typeof heartbeatBody>): Promise<{ updateRequested: boolean; latestVersion: string | null } | null> {
  const res = await fetch(`${heartbeatBase(safeStored('kastra-server-url'))}/desktop/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { updateRequested?: boolean; latestVersion?: string | null } | null;
  return json ? { updateRequested: !!json.updateRequested, latestVersion: json.latestVersion ?? null } : null;
}

const FIRST_CHECK_MS = 20 * 1000;
const EVERY_MS = 6 * 60 * 60 * 1000;

/** Start the background checks (once per mounting of the banner). A no-op outside the desktop app. */
export function startUpdateChecks(): () => void {
  if (!inDesktopApp()) return () => undefined;
  // First of all: is an install already running from before this page loaded?
  void useAppUpdate.getState().resume();
  const run = () => {
    void useAppUpdate.getState().report();
    void useAppUpdate.getState().check();
  };
  const first = setTimeout(run, FIRST_CHECK_MS);
  const every = setInterval(run, EVERY_MS);
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
