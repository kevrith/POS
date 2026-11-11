/**
 * The arithmetic of forecourt control, kept apart from the database so it can be tested on its own.
 *
 * Three questions a station owner asks every day, each answered by comparing two independent records:
 *  - did every litre that left a nozzle get rung up?   (meter movement vs sales + pump tests)
 *  - did the tank lose or gain fuel it should not?      (measured dip vs the book level)
 *  - did the supplier deliver what the note says?       (dips around the offload vs the delivery note)
 */

/** A meter may read a little differently from what was keyed in from the pump display. */
export const METER_TOLERANCE_LITRES = 1;
export const METER_TOLERANCE_PCT = 0.002;
/** Gain/loss in a tank as a share of what went through it. Industry practice flags around half a percent. */
export const WET_STOCK_ALERT_PCT = 0.5;
export const WET_STOCK_WATCH_PCT = 0.25;
/** With no sales to compare against, a tank that is this many litres off is still a finding. */
export const WET_STOCK_IDLE_ALERT_LITRES = 20;
/** A delivery short by more than this share of the note is a claim against the supplier. */
export const DELIVERY_SHORT_PCT = 0.5;
/** A measured tank level and the book level agree to within a litre or so; the dip stick is not finer than that. */
export const DIP_NOISE_LITRES = 0.5;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type MeterFlag = 'OK' | 'UNRECORDED' | 'OVER_RECORDED';

export interface NozzleReconciliation {
  meterLitres: number;
  soldLitres: number;
  testLitres: number;
  /** Litres through the meter that nobody rang up (positive) or were rung up without passing the meter (negative). */
  unrecordedLitres: number;
  flag: MeterFlag;
}

/** Meter movement against litres sold and litres drawn for tests. */
export function reconcileNozzle(input: { opening: number; closing: number; soldLitres: number; testLitres: number }): NozzleReconciliation {
  const meterLitres = round3(input.closing - input.opening);
  const soldLitres = round3(input.soldLitres);
  const testLitres = round3(input.testLitres);
  const unrecordedLitres = round3(meterLitres - soldLitres - testLitres);
  const tolerance = Math.max(METER_TOLERANCE_LITRES, Math.abs(meterLitres) * METER_TOLERANCE_PCT);
  const flag: MeterFlag = Math.abs(unrecordedLitres) <= tolerance ? 'OK' : unrecordedLitres > 0 ? 'UNRECORDED' : 'OVER_RECORDED';
  return { meterLitres, soldLitres, testLitres, unrecordedLitres, flag };
}

/** Does an opening reading continue from where the meter stopped last time? */
export function meterGap(lastKnown: number, opening: number): number {
  return round3(opening - lastKnown);
}
export const hasMeterGap = (gap: number) => Math.abs(gap) > METER_TOLERANCE_LITRES;

export type WetStockStatus = 'OK' | 'WATCH' | 'ALERT';

/** Gain/loss against throughput. Negative = fuel missing. */
export function wetStockStatus(varianceLitres: number, throughputLitres: number): { variancePct: number; status: WetStockStatus } {
  if (throughputLitres <= 0) {
    return { variancePct: 0, status: Math.abs(varianceLitres) > WET_STOCK_IDLE_ALERT_LITRES ? 'ALERT' : 'OK' };
  }
  const variancePct = round2((varianceLitres / throughputLitres) * 100);
  const abs = Math.abs(variancePct);
  return { variancePct, status: abs > WET_STOCK_ALERT_PCT ? 'ALERT' : abs > WET_STOCK_WATCH_PCT ? 'WATCH' : 'OK' };
}

/** The new average cost of a litre after fuel is added to a tank. A tank with nothing in it takes the new cost. */
export function weightedAverageCost(bookLitres: number, currentAvgCents: number, receivedLitres: number, unitCostCents: number): number {
  const have = Math.max(0, bookLitres);
  const total = have + receivedLitres;
  if (total <= 0) return unitCostCents;
  // An unknown (0) average on stock already in the tank must not drag the average down to nothing.
  if (have > 0 && currentAvgCents <= 0) return unitCostCents;
  return (have * currentAvgCents + receivedLitres * unitCostCents) / total;
}

export interface DeliveryCheck {
  receivedLitres: number;
  shortLitres: number;
  shortPct: number;
  isShort: boolean;
}

/** What went into the tank against what the supplier's note says. With both dips the tank's own measurement decides. */
export function checkDelivery(input: { docketLitres: number; dipBefore?: number | null; dipAfter?: number | null }): DeliveryCheck {
  const measured = input.dipBefore != null && input.dipAfter != null;
  const receivedLitres = round3(measured ? (input.dipAfter as number) - (input.dipBefore as number) : input.docketLitres);
  const shortLitres = round3(input.docketLitres - receivedLitres);
  const shortPct = input.docketLitres > 0 ? round2((shortLitres / input.docketLitres) * 100) : 0;
  return { receivedLitres, shortLitres, shortPct, isShort: shortPct > DELIVERY_SHORT_PCT };
}

/** Cash handed in against cash the books expected. Negative = short. */
export const cashVariance = (declaredCents: number, expectedCents: number) => declaredCents - expectedCents;

/** Margin of a sale: what it brought in minus what the fuel cost. Null when the cost was not known. */
export function marginCents(totalCents: number, litres: number, unitCostCents: number | null | undefined): number | null {
  if (unitCostCents == null || unitCostCents <= 0) return null;
  return Math.round(totalCents - litres * unitCostCents);
}
