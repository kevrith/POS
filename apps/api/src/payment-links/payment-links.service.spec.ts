import { effectiveStatus } from './payment-links.service';

const NOW = new Date('2026-08-13T12:00:00Z');

function link(overrides: Record<string, any> = {}) {
  return { status: 'ACTIVE', expiresAt: null, maxUses: null, usesCount: 0, ...overrides };
}

describe('effectiveStatus', () => {
  it('leaves a live link active', () => {
    expect(effectiveStatus(link(), NOW)).toBe('ACTIVE');
    expect(effectiveStatus(link({ expiresAt: new Date('2026-08-14T00:00:00Z') }), NOW)).toBe('ACTIVE');
  });

  // The bug this exists for: expiry is applied lazily on visit, so the stored
  // status still said ACTIVE for a link that lapsed six weeks earlier.
  it('reports a past expiry as expired even though the row still says ACTIVE', () => {
    expect(effectiveStatus(link({ expiresAt: new Date('2026-06-30T00:00:00Z') }), NOW)).toBe('EXPIRED');
  });

  it('treats a link with no expiry as never expiring', () => {
    expect(effectiveStatus(link({ expiresAt: null }), NOW)).toBe('ACTIVE');
  });

  it('expires a link that has reached its maximum uses', () => {
    expect(effectiveStatus(link({ maxUses: 3, usesCount: 3 }), NOW)).toBe('EXPIRED');
    expect(effectiveStatus(link({ maxUses: 3, usesCount: 4 }), NOW)).toBe('EXPIRED');
  });

  it('keeps a link with uses remaining active', () => {
    expect(effectiveStatus(link({ maxUses: 3, usesCount: 2 }), NOW)).toBe('ACTIVE');
  });

  it('ignores maxUses when it is not set', () => {
    expect(effectiveStatus(link({ maxUses: null, usesCount: 99 }), NOW)).toBe('ACTIVE');
  });

  // A deliberate act by the owner outranks any automatic transition — a
  // disabled link must not silently re-label itself as merely expired.
  it('leaves a disabled link disabled regardless of dates or uses', () => {
    expect(effectiveStatus(link({ status: 'DISABLED' }), NOW)).toBe('DISABLED');
    expect(effectiveStatus(link({ status: 'DISABLED', expiresAt: new Date('2026-06-30T00:00:00Z') }), NOW)).toBe('DISABLED');
    expect(effectiveStatus(link({ status: 'DISABLED', maxUses: 1, usesCount: 5 }), NOW)).toBe('DISABLED');
  });

  it('leaves an already-expired row alone', () => {
    expect(effectiveStatus(link({ status: 'EXPIRED' }), NOW)).toBe('EXPIRED');
  });

  it('expires exactly at the boundary second, not before', () => {
    const boundary = new Date(NOW);
    expect(effectiveStatus(link({ expiresAt: boundary }), NOW)).toBe('ACTIVE');
    expect(effectiveStatus(link({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe('EXPIRED');
  });
});
