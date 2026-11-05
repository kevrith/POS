/**
 * Stock and sale quantities are stored as doubles so loose goods (0.5 kg, 2.25 m) are exact enough, but a
 * double sum such as 0.1 + 0.2 - 0.3 leaves a crumb (5.5e-17) that reads as "in stock" to a `> 0` test.
 * Quantities are therefore kept to whole grams / millilitres: three decimal places.
 */
export const QTY_DECIMALS = 3;
const FACTOR = 10 ** QTY_DECIMALS;
/** Anything below half a unit of the smallest step is zero. */
export const QTY_EPSILON = 0.5 / FACTOR;

export function roundQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const r = Math.round(n * FACTOR) / FACTOR;
  return r === 0 ? 0 : r; // never -0
}

/** True when a client-sent quantity has more precision than the ledger keeps. */
export function hasTooManyDecimals(n: number): boolean {
  return Math.abs(roundQty(n) - n) > 1e-9;
}
