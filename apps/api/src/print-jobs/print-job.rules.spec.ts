import { MAX_ATTEMPTS, afterFailure, backoffMs, isPrintJobKind, parseIpHostPort, ttlMs } from './print-job.rules';

describe('print job rules', () => {
  it('lets a cash drawer pulse and a kitchen ticket go stale quickly but keeps receipts all day', () => {
    expect(ttlMs('DRAWER')).toBeLessThan(ttlMs('KOT'));
    expect(ttlMs('KOT')).toBeLessThan(ttlMs('BILL'));
    expect(ttlMs('BILL')).toBeLessThan(ttlMs('RECEIPT'));
  });

  it('backs off exponentially and never waits more than five minutes', () => {
    expect(backoffMs(1)).toBe(5_000);
    expect(backoffMs(2)).toBe(10_000);
    expect(backoffMs(3)).toBe(20_000);
    expect(backoffMs(30)).toBe(300_000);
  });

  it('retries a failure until the attempt limit, then gives up', () => {
    const now = new Date('2026-11-04T10:00:00Z');
    expect(afterFailure({ attempts: 1, now })).toEqual({ status: 'QUEUED', nextAttemptAt: new Date(now.getTime() + 5_000) });
    expect(afterFailure({ attempts: MAX_ATTEMPTS, now })).toEqual({ status: 'FAILED' });
  });

  it('never retries a failure marked permanent', () => {
    expect(afterFailure({ attempts: 1, permanent: true, now: new Date() })).toEqual({ status: 'FAILED' });
  });

  it('accepts only an IP literal with a valid port for a bridge target', () => {
    expect(parseIpHostPort('192.168.1.50')).toEqual({ host: '192.168.1.50', port: 9100 });
    expect(parseIpHostPort(' 10.0.0.7:9101 ')).toEqual({ host: '10.0.0.7', port: 9101 });
    expect(parseIpHostPort('printer.local')).toBeNull();
    expect(parseIpHostPort('192.168.1.50:99999')).toBeNull();
    expect(parseIpHostPort('')).toBeNull();
    expect(parseIpHostPort(undefined)).toBeNull();
  });

  it('knows the job kinds', () => {
    expect(isPrintJobKind('KOT')).toBe(true);
    expect(isPrintJobKind('INVOICE')).toBe(false);
  });
});
