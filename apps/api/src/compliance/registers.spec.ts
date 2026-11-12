import { controlledSummary, medicinesText, parseMedicines, periodOf } from './registers';

const NOW = new Date('2026-11-12T10:00:00Z');

describe('periodOf', () => {
  it('defaults to the last 30 days and takes bare dates as whole Nairobi days', () => {
    const d = periodOf(undefined, undefined, NOW);
    expect(d.toDay).toBe('2026-11-12');
    const p = periodOf('2026-11-01', '2026-11-03', NOW);
    expect(p.from.toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(p.to.toISOString()).toBe('2026-11-03T20:59:59.999Z');
  });
  it('refuses a backwards period, nonsense and more than a year', () => {
    expect(() => periodOf('2026-11-05', '2026-11-03', NOW)).toThrow(/after the end/);
    expect(() => periodOf('last week', '2026-11-03', NOW)).toThrow(/not a valid date/);
    expect(() => periodOf('2025-01-01', '2026-11-03', NOW)).toThrow(/at most 366/);
  });
});

describe('medicines', () => {
  it('reads what is stored and tolerates what is not', () => {
    const raw = JSON.stringify([{ name: 'Amoxicillin 500mg', qty: 21, dose: 1, doseUnit: 'capsule', frequency: 'TDS' }, { nope: 1 }]);
    expect(parseMedicines(raw)).toHaveLength(1);
    expect(medicinesText(parseMedicines(raw))).toBe('Amoxicillin 500mg x 21 (1 capsule TDS)');
    expect(parseMedicines('garbage')).toEqual([]);
    expect(parseMedicines(null)).toEqual([]);
  });
});

describe('controlledSummary', () => {
  it('adds up the register per medicine next to the stock held, and keeps entries for medicines no longer listed', () => {
    const rows = controlledSummary(
      [{ itemName: 'Morphine 10mg/ml', quantityDispensed: 2, dispensedAt: NOW }, { itemName: 'morphine 10mg/ml', quantityDispensed: 1.5, dispensedAt: NOW }, { itemName: 'Old Drug', quantityDispensed: 1, dispensedAt: NOW }],
      [{ name: 'Morphine 10mg/ml', scheduleClass: 'II', onHand: 40 }, { name: 'Diazepam 5mg', scheduleClass: 'IV', onHand: 100 }],
    );
    expect(rows.find((r) => r.itemName === 'Morphine 10mg/ml')).toEqual({ itemName: 'Morphine 10mg/ml', scheduleClass: 'II', entries: 2, dispensed: 3.5, onHand: 40 });
    expect(rows.find((r) => r.itemName === 'Diazepam 5mg')).toMatchObject({ entries: 0, dispensed: 0, onHand: 100 });
    expect(rows.find((r) => r.itemName === 'Old Drug')).toMatchObject({ scheduleClass: null, entries: 1, onHand: null });
  });
});
