import {
  POS_MODES,
  DEFAULT_POS_MODE,
  MOBILE_UNSUPPORTED_MODES,
  normalizePosMode,
  hasCapability,
  isVisibleForMode,
  posModeLabel,
  hasTables,
  hasKitchen,
  hasPumps,
  hasLayaway,
  hasAppointments,
  hasPrescriptions,
  hasServiceCharge,
  type PosMode,
} from '../lib/posMode';

describe('normalizePosMode', () => {
  it('accepts every known mode', () => {
    for (const m of POS_MODES) expect(normalizePosMode(m)).toBe(m);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(normalizePosMode('hospitality')).toBe('HOSPITALITY');
    expect(normalizePosMode('  Fuel_Pump  ')).toBe('FUEL_PUMP');
  });

  // posMode is a free-text String column, not a Prisma enum — bad data is
  // reachable, and it must degrade to the column default rather than throw.
  it('falls back to RETAIL for unknown, empty and nullish values', () => {
    expect(normalizePosMode('WAREHOUSE')).toBe(DEFAULT_POS_MODE);
    expect(normalizePosMode('')).toBe(DEFAULT_POS_MODE);
    expect(normalizePosMode(null)).toBe(DEFAULT_POS_MODE);
    expect(normalizePosMode(undefined)).toBe(DEFAULT_POS_MODE);
  });
});

describe('capabilities', () => {
  it('gives all three dine-in modes tables, kitchen and service charge', () => {
    for (const m of ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'] as PosMode[]) {
      expect(hasTables(m)).toBe(true);
      expect(hasKitchen(m)).toBe(true);
      expect(hasServiceCharge(m)).toBe(true);
    }
  });

  it('does not give a retail shop dine-in behaviour', () => {
    expect(hasTables('RETAIL')).toBe(false);
    expect(hasKitchen('RETAIL')).toBe(false);
    expect(hasServiceCharge('RETAIL')).toBe(false);
  });

  it('scopes single-vertical capabilities to their own mode', () => {
    expect(hasPumps('FUEL_PUMP')).toBe(true);
    expect(hasPumps('RETAIL')).toBe(false);
    expect(hasPrescriptions('CLINIC')).toBe(true);
    expect(hasPrescriptions('SALON')).toBe(false);
  });

  it('shares appointments between clinic and salon', () => {
    expect(hasAppointments('CLINIC')).toBe(true);
    expect(hasAppointments('SALON')).toBe(true);
    expect(hasAppointments('HOSPITALITY')).toBe(false);
  });

  it('gives layaway to goods-on-shelf verticals only', () => {
    expect(hasLayaway('RETAIL')).toBe(true);
    expect(hasLayaway('SUPERMARKET')).toBe(true);
    expect(hasLayaway('BAR_TAB')).toBe(false);
  });

  it('treats an unknown mode as RETAIL rather than granting nothing', () => {
    expect(hasCapability('NOT_A_MODE', 'layaway')).toBe(true);
    expect(hasCapability('NOT_A_MODE', 'tables')).toBe(false);
  });
});

describe('isVisibleForMode', () => {
  it('shows universal items (no modes listed) to every vertical', () => {
    for (const m of POS_MODES) {
      expect(isVisibleForMode(undefined, m)).toBe(true);
      expect(isVisibleForMode([], m)).toBe(true);
    }
  });

  it('shows a scoped item only to its listed verticals', () => {
    const dineIn: PosMode[] = ['HOSPITALITY', 'FAST_FOOD', 'BAR_TAB'];
    expect(isVisibleForMode(dineIn, 'HOSPITALITY')).toBe(true);
    expect(isVisibleForMode(dineIn, 'RETAIL')).toBe(false);
  });
});

describe('labels', () => {
  it('labels every mode', () => {
    for (const m of POS_MODES) expect(posModeLabel(m).length).toBeGreaterThan(0);
  });

  it('labels an unknown mode as retail rather than blank', () => {
    expect(posModeLabel('???')).toBe(posModeLabel('RETAIL'));
  });
});

describe('MOBILE_UNSUPPORTED_MODES', () => {
  it('only ever names real modes', () => {
    for (const m of MOBILE_UNSUPPORTED_MODES) {
      expect(POS_MODES).toContain(m);
    }
  });
});
