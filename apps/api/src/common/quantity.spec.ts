import { QTY_EPSILON, hasTooManyDecimals, roundQty } from './quantity';

describe('roundQty', () => {
  it('removes floating-point crumbs so an empty shelf reads as empty', () => {
    expect(roundQty(0.1 + 0.2 - 0.3)).toBe(0);
    expect(roundQty(5 - 0.1 - 0.2 - 4.7)).toBe(0);
    expect(roundQty(0.30000000000000004)).toBe(0.3);
  });
  it('keeps three decimals', () => {
    expect(roundQty(1.23456)).toBe(1.235);
    expect(roundQty(2.5)).toBe(2.5);
  });
  it('never returns -0 or a non-finite value', () => {
    expect(Object.is(roundQty(-0.0001), 0)).toBe(true);
    expect(roundQty(NaN)).toBe(0);
    expect(roundQty(Infinity)).toBe(0);
  });
  it('flags quantities finer than the ledger keeps', () => {
    expect(hasTooManyDecimals(0.5)).toBe(false);
    expect(hasTooManyDecimals(0.123)).toBe(false);
    expect(hasTooManyDecimals(0.1234)).toBe(true);
    expect(QTY_EPSILON).toBeCloseTo(0.0005);
  });
});
