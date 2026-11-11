import { describe, expect, it } from 'vitest';
import { isMainTillPath, mainTillFor } from '../mainTill';

const MODES = ['RETAIL', 'SUPERMARKET', 'HOSPITALITY', 'FAST_FOOD', 'BAR_TAB', 'FUEL_PUMP', 'CYBERCAFE', 'CLINIC', 'SALON'];

describe('the main till entry', () => {
  it('is named for what it opens, differently for each kind of business', () => {
    expect(mainTillFor('SUPERMARKET').label).toBe('Supermarket POS');
    expect(mainTillFor('FUEL_PUMP').label).toBe('Fuel Forecourt');
    expect(mainTillFor('SALON').label).toBe('Salon POS');
    expect(new Set(MODES.map((m) => mainTillFor(m).label)).size).toBe(MODES.length);
    expect(new Set(MODES.map((m) => mainTillFor(m).shortLabel)).size).toBeGreaterThan(6);
  });

  it('falls back to the standard till for an unknown or missing mode, and ignores case', () => {
    expect(mainTillFor(undefined).label).toBe('Point of Sale');
    expect(mainTillFor('NOPE').label).toBe('Point of Sale');
    expect(mainTillFor('salon').label).toBe('Salon POS');
  });

  it('counts the forecourt, cybercafe and supermarket addresses as the till', () => {
    for (const p of ['/pos', '/fuel-pump', '/cybercafe', '/supermart']) expect(isMainTillPath(p), p).toBe(true);
    for (const p of ['/shop-till', '/appointments', '/pos-settings', '/inventory']) expect(isMainTillPath(p), p).toBe(false);
  });
});
