import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canInstallUpdate, checkedAgo, describeProgress, heartbeatBase, heartbeatBody, isInstalling, percentDone, systemName, useAppUpdate, type UpdateProgress } from '../appUpdate';
import { KASTRA_CLOUD_API } from '../cloudUrl';

const progress = (p: Partial<UpdateProgress>): UpdateProgress => ({ stage: 'idle', downloaded: 0, ...p });

describe('who may install', () => {
  it('only the owner and managers decide when the whole app closes', () => {
    expect(canInstallUpdate('OWNER')).toBe(true);
    expect(canInstallUpdate('MANAGER')).toBe(true);
    for (const role of ['CASHIER', 'WAITER', 'KITCHEN', 'ACCOUNTANT', undefined]) expect(canInstallUpdate(role)).toBe(false);
  });
});

describe('progress wording', () => {
  it('shows a percentage only while downloading with a known size', () => {
    expect(percentDone(progress({ stage: 'downloading', downloaded: 25, total: 100 }))).toBe(25);
    expect(percentDone(progress({ stage: 'downloading', downloaded: 500, total: 100 }))).toBe(100);
    expect(percentDone(progress({ stage: 'downloading', downloaded: 5, total: null }))).toBeNull();
    expect(percentDone(progress({ stage: 'installing', downloaded: 5, total: 10 }))).toBeNull();
  });

  it('says what is happening at every stage, including that data is saved first', () => {
    expect(describeProgress(progress({ stage: 'downloading', downloaded: 1, total: 4 }))).toBe('Downloading the update, 25%');
    expect(describeProgress(progress({ stage: 'downloading' }))).toBe('Downloading the update');
    expect(describeProgress(progress({ stage: 'stopping' }))).toMatch(/saving your data/i);
    expect(describeProgress(progress({ stage: 'installing' }))).toMatch(/restart by itself/i);
    expect(describeProgress(progress({ stage: 'error', error: 'The download did not finish: timed out' }))).toBe('The download did not finish: timed out');
    expect(describeProgress(progress({ stage: 'error' }))).toMatch(/nothing was changed/i);
    expect(describeProgress(progress({}))).toBe('');
  });

  it('treats downloading, stopping and installing as busy', () => {
    expect(['downloading', 'stopping', 'installing'].every((stage) => isInstalling(progress({ stage: stage as UpdateProgress['stage'] })))).toBe(true);
    expect(isInstalling(progress({}))).toBe(false);
    expect(isInstalling(progress({ stage: 'error' }))).toBe(false);
  });
});

describe('last checked', () => {
  const now = 1_000_000_000_000;
  it('reads naturally', () => {
    expect(checkedAgo(undefined, now)).toBe('not yet');
    expect(checkedAgo(now - 20_000, now)).toBe('just now');
    expect(checkedAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(checkedAgo(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(checkedAgo(now - 3 * 60 * 60_000, now)).toBe('3 hours ago');
  });
});

describe('the update store, against a stand-in desktop app', () => {
  type Handler = (args?: Record<string, unknown>) => unknown;
  let handlers: Record<string, Handler>;
  let calls: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    calls = [];
    handlers = {};
    vi.stubGlobal('window', {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          calls.push(cmd);
          if (!handlers[cmd]) throw new Error(`no handler for ${cmd}`);
          return handlers[cmd](args);
        },
      },
    });
    useAppUpdate.setState({ found: null, checking: false, checkedAt: undefined, checkError: undefined, progress: { stage: 'idle', downloaded: 0 }, dismissed: false, requested: false, version: undefined });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('finds a newer version and remembers "Later" for that version only', async () => {
    handlers.app_version = () => '1.0.0';
    handlers.app_update_check = () => ({ version: '1.1.0', currentVersion: '1.0.0', notes: 'Fixes' });
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState().found?.version).toBe('1.1.0');
    expect(useAppUpdate.getState().version).toBe('1.0.0');

    useAppUpdate.getState().dismiss();
    await useAppUpdate.getState().check(); // same version found again: still dismissed
    expect(useAppUpdate.getState().dismissed).toBe(true);

    handlers.app_update_check = () => ({ version: '1.2.0', currentVersion: '1.0.0' });
    await useAppUpdate.getState().check(); // a newer one: shown again
    expect(useAppUpdate.getState().dismissed).toBe(false);
  });

  it('stays quiet when a background check fails (no internet) but explains a check the owner asked for', async () => {
    handlers.app_version = () => '1.0.0';
    handlers.app_update_check = () => {
      throw 'Could not check for updates: offline';
    };
    await useAppUpdate.getState().check();
    expect(useAppUpdate.getState().checkError).toBeUndefined();
    await useAppUpdate.getState().check(true);
    expect(useAppUpdate.getState().checkError).toMatch(/offline/);
  });

  it('follows an install through its stages and reports a failure', async () => {
    const stages: UpdateProgress[] = [
      { stage: 'downloading', downloaded: 50, total: 100 },
      { stage: 'stopping', downloaded: 100, total: 100 },
      { stage: 'error', downloaded: 100, total: 100, error: 'The update could not be installed: access denied' },
    ];
    handlers.app_update_install = () => undefined;
    handlers.app_update_status = () => stages.shift() ?? { stage: 'idle', downloaded: 0 };

    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().progress.stage).toBe('downloading');
    await vi.advanceTimersByTimeAsync(0);
    expect(useAppUpdate.getState().progress).toMatchObject({ stage: 'downloading', downloaded: 50 });
    await vi.advanceTimersByTimeAsync(700);
    expect(useAppUpdate.getState().progress.stage).toBe('stopping');
    await vi.advanceTimersByTimeAsync(700);
    expect(useAppUpdate.getState().progress).toMatchObject({ stage: 'error', error: expect.stringMatching(/access denied/) });
    const asked = calls.filter((c) => c === 'app_update_status').length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.filter((c) => c === 'app_update_status').length).toBe(asked); // stopped polling after the error
  });

  it('shows an error at once when the install cannot even start, and does not poll', async () => {
    handlers.app_update_install = () => {
      throw 'No update has been found yet. Check for updates first.';
    };
    await useAppUpdate.getState().install();
    expect(useAppUpdate.getState().progress).toMatchObject({ stage: 'error', error: expect.stringMatching(/check for updates first/i) });
    expect(calls).not.toContain('app_update_status');
  });

  it('picks a running download back up after the page is refreshed', async () => {
    // The page just loaded: its own copy says idle, but the desktop program is half way through the download.
    handlers.app_update_status = () => ({ stage: 'downloading', downloaded: 60, total: 100 });
    expect(useAppUpdate.getState().progress.stage).toBe('idle');
    await useAppUpdate.getState().resume();
    expect(useAppUpdate.getState().progress).toMatchObject({ stage: 'downloading', downloaded: 60 });

    // ...and keeps following it to the end.
    handlers.app_update_status = () => ({ stage: 'installing', downloaded: 100, total: 100 });
    await vi.advanceTimersByTimeAsync(700);
    expect(useAppUpdate.getState().progress.stage).toBe('installing');

    // Let it finish, so its polling stops and cannot leak into the next test.
    handlers.app_update_status = () => ({ stage: 'idle', downloaded: 0 });
    await vi.advanceTimersByTimeAsync(700);
  });

  it('does not invent progress when nothing is running', async () => {
    handlers.app_update_status = () => ({ stage: 'idle', downloaded: 0 });
    await useAppUpdate.getState().resume();
    expect(useAppUpdate.getState().progress.stage).toBe('idle');
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.filter((c) => c === 'app_update_status').length).toBe(1); // no polling started
  });

  it('joins an install that is already running instead of reporting it as an error', async () => {
    // The owner refreshed mid-download, then pressed Install again.
    handlers.app_update_install = () => {
      throw 'An update is already being installed.';
    };
    handlers.app_update_status = () => ({ stage: 'downloading', downloaded: 80, total: 100 });
    await useAppUpdate.getState().install();
    await vi.advanceTimersByTimeAsync(0);
    expect(useAppUpdate.getState().progress).toMatchObject({ stage: 'downloading', downloaded: 80 });
    expect(useAppUpdate.getState().progress.stage).not.toBe('error');
  });

  describe('reporting this computer to the KASTRA server', () => {
    const machine = { machine_id: 'machine-1234567890', hostname: 'SHOP-PC' };
    let sent: Array<{ url: string; body: Record<string, unknown> }>;
    let answer: { ok: boolean; json: unknown } | 'offline';

    beforeEach(() => {
      sent = [];
      answer = { ok: true, json: { updateRequested: false, latestVersion: '1.1.6' } };
      handlers.get_machine_id = () => machine;
      handlers.app_version = () => '1.1.2';
      handlers.app_update_check = () => ({ version: '1.1.6', currentVersion: '1.1.2' });
      vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
        sent.push({ url, body: JSON.parse(init.body) });
        if (answer === 'offline') throw new TypeError('Failed to fetch');
        return { ok: answer.ok, json: async () => answer.json } as unknown as Response;
      });
      // the stand-in window has no storage, so reading settings must not break
    });

    it('sends the version and computer, and nothing else about the shop', async () => {
      await useAppUpdate.getState().report();
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe(`${KASTRA_CLOUD_API}/desktop/heartbeat`);
      // only these fields may ever be sent (a field the app does not know is left out)
      const allowed = ['appVersion', 'businessId', 'businessName', 'hostname', 'machineId', 'os'];
      expect(Object.keys(sent[0].body).every((k) => allowed.includes(k))).toBe(true);
      expect(Object.keys(sent[0].body)).toEqual(expect.arrayContaining(['appVersion', 'hostname', 'machineId', 'os']));
      expect(sent[0].body).toMatchObject({ machineId: 'machine-1234567890', hostname: 'SHOP-PC', appVersion: '1.1.2' });
      expect(useAppUpdate.getState().requested).toBe(false);
    });

    it('learns that an update was requested, and goes and finds it at once', async () => {
      answer = { ok: true, json: { updateRequested: true, latestVersion: '1.1.6' } };
      await useAppUpdate.getState().report();
      await vi.advanceTimersByTimeAsync(0);
      expect(useAppUpdate.getState().requested).toBe(true);
      expect(calls).toContain('app_update_check');
      expect(useAppUpdate.getState().found?.version).toBe('1.1.6');
    });

    it('stays quiet when the server cannot be reached or refuses', async () => {
      answer = 'offline';
      await expect(useAppUpdate.getState().report()).resolves.toBeUndefined();
      answer = { ok: false, json: null };
      await expect(useAppUpdate.getState().report()).resolves.toBeUndefined();
      expect(useAppUpdate.getState().requested).toBe(false);
    });

    it('reports nothing outside the desktop app', async () => {
      vi.stubGlobal('window', {});
      await useAppUpdate.getState().report();
      expect(sent).toEqual([]);
    });
  });

  it('does nothing outside the desktop app', async () => {
    vi.stubGlobal('window', {}); // a plain browser: no desktop bridge
    await useAppUpdate.getState().check(true);
    await useAppUpdate.getState().install();
    await useAppUpdate.getState().resume();
    expect(calls).toEqual([]);
    expect(useAppUpdate.getState().progress.stage).toBe('idle');
  });
});

describe('where a computer reports to', () => {
  it('the cloud, unless the computer is set up against a public server, and never a private address', () => {
    expect(heartbeatBase(null)).toBe(KASTRA_CLOUD_API);
    expect(heartbeatBase('http://127.0.0.1:3010')).toBe(KASTRA_CLOUD_API);
    expect(heartbeatBase('http://192.168.1.20:3010')).toBe(KASTRA_CLOUD_API);
    expect(heartbeatBase('https://pos.example.com/')).toBe('https://pos.example.com/api/v1');
  });

  it('names the system from the browser string', () => {
    expect(systemName('Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebView2')).toBe('windows');
    expect(systemName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('macos');
    expect(systemName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(systemName('')).toBe('unknown');
  });

  it('builds the report from what the app knows', () => {
    const body = heartbeatBody({ machine_id: 'abcdefgh1234', hostname: 'PC' }, '1.1.6', { businessId: 'b1', businessName: 'Premier', userAgent: 'Windows' });
    expect(body).toEqual({ machineId: 'abcdefgh1234', hostname: 'PC', os: 'windows', appVersion: '1.1.6', businessId: 'b1', businessName: 'Premier' });
  });
});
