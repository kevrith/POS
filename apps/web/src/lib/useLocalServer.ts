import { useCallback, useEffect, useRef, useState } from 'react';
import { getSetupMode, inDesktopApp, serverStatus, type LocalServerStatus } from './desktopServer';
import type { SetupSummary } from './desktopSetup';

const WAITING: LocalServerStatus = { phase: 'starting', message: 'Starting', addresses: [] };

/**
 * The local server's live status, asked of the desktop app every `everyMs` while the page is open. A failed ask
 * (the desktop app not answering) is shown as an error instead of leaving the screen stuck on "Starting".
 */
export function useLocalServer(everyMs = 1500): { status: LocalServerStatus; refresh: () => void } {
  const [status, setStatus] = useState<LocalServerStatus>(WAITING);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    if (!inDesktopApp()) return;
    serverStatus().then(
      (s) => alive.current && setStatus(s),
      (e: Error) => alive.current && setStatus({ phase: 'error', message: e.message, addresses: [] }),
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const t = setInterval(refresh, everyMs);
    return () => { alive.current = false; clearInterval(t); };
  }, [refresh, everyMs]);

  return { status, refresh };
}

/**
 * How this desktop computer was set up (CLOUD, SERVER_POS, SERVER, CLIENT), or null outside the desktop app.
 * `undefined` while it is being read, so a screen can wait instead of flashing the wrong thing.
 */
export function useDesktopMode(): string | null | undefined {
  const [mode, setMode] = useState<string | null | undefined>(inDesktopApp() ? undefined : null);
  useEffect(() => {
    if (!inDesktopApp()) return;
    let alive = true;
    getSetupMode().then(
      (c) => alive && setMode(c?.mode ?? null),
      () => alive && setMode(null),
    );
    return () => { alive = false; };
  }, []);
  return mode;
}

/** The whole saved setup (mode, server address, business name), or null outside the desktop app / before setup. */
export function useDesktopSetup(): SetupSummary | null {
  const [cfg, setCfg] = useState<SetupSummary | null>(null);
  useEffect(() => {
    if (!inDesktopApp()) return;
    let alive = true;
    getSetupMode().then((c) => alive && setCfg(c), () => undefined);
    return () => { alive = false; };
  }, []);
  return cfg;
}
