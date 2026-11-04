// Pure rules for the print queue: no database, no clock of its own, so they are cheap to test.

export const PRINT_JOB_KINDS = ['RECEIPT', 'KOT', 'BILL', 'DRAWER', 'TEST'] as const;
export type PrintJobKind = (typeof PRINT_JOB_KINDS)[number];

/** Ways a print can reach paper from the person's own device (logged, never queued). */
export const CLIENT_METHODS = ['BROWSER', 'USB', 'BLUETOOTH', 'SYSTEM', 'STAR', 'EPSON'] as const;

export const MAX_ATTEMPTS = 5;
export const MAX_PAYLOAD_BYTES = 1024 * 1024;
/** A bridge that claimed a job and went silent (crash, sleep) loses it after this long. */
export const STALE_SENDING_MS = 60_000;

export function isPrintJobKind(value: unknown): value is PrintJobKind {
  return typeof value === 'string' && (PRINT_JOB_KINDS as readonly string[]).includes(value);
}

/**
 * How long a queued job stays worth printing. A kitchen ticket an hour late only confuses the
 * kitchen, and a cash drawer pulse that fires minutes later opens a drawer nobody is watching.
 */
export function ttlMs(kind: PrintJobKind): number {
  switch (kind) {
    case 'DRAWER': return 2 * 60_000;
    case 'KOT': return 15 * 60_000;
    case 'TEST': return 10 * 60_000;
    case 'BILL': return 2 * 3_600_000;
    case 'RECEIPT': return 24 * 3_600_000;
  }
}

/** 5 s, 10 s, 20 s, 40 s ... capped at 5 minutes. `attempts` is the number already made. */
export function backoffMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
}

export type FailureOutcome =
  | { status: 'FAILED' }
  | { status: 'QUEUED'; nextAttemptAt: Date };

/** What happens to a job after a failed delivery attempt. */
export function afterFailure(input: { attempts: number; permanent?: boolean; now: Date }): FailureOutcome {
  if (input.permanent || input.attempts >= MAX_ATTEMPTS) return { status: 'FAILED' };
  return { status: 'QUEUED', nextAttemptAt: new Date(input.now.getTime() + backoffMs(input.attempts)) };
}

/** `192.168.1.50` or `192.168.1.50:9100`; the host must be an IP literal. Returns null for anything else. */
export function parseIpHostPort(details: string | null | undefined): { host: string; port: number } | null {
  const [host, portStr] = (details ?? '').trim().split(':');
  const port = portStr === undefined ? 9100 : Number(portStr);
  if (!host || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port };
}
