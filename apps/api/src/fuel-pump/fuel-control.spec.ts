import {
  reconcileNozzle, meterGap, hasMeterGap, wetStockStatus, weightedAverageCost, checkDelivery, cashVariance, marginCents,
} from './fuel-control';

describe('reconcileNozzle', () => {
  it('balances when the meter matches sales plus tests', () => {
    const r = reconcileNozzle({ opening: 1000, closing: 1500, soldLitres: 495, testLitres: 5 });
    expect(r).toMatchObject({ meterLitres: 500, unrecordedLitres: 0, flag: 'OK' });
  });
  it('flags litres through the meter that nobody rang up', () => {
    const r = reconcileNozzle({ opening: 0, closing: 400, soldLitres: 380, testLitres: 0 });
    expect(r.unrecordedLitres).toBe(20);
    expect(r.flag).toBe('UNRECORDED');
  });
  it('flags sales that never passed the meter', () => {
    const r = reconcileNozzle({ opening: 0, closing: 100, soldLitres: 130, testLitres: 0 });
    expect(r.unrecordedLitres).toBe(-30);
    expect(r.flag).toBe('OVER_RECORDED');
  });
  it('lets a litre of rounding through, and a share of a big throughput', () => {
    expect(reconcileNozzle({ opening: 0, closing: 100, soldLitres: 99.2, testLitres: 0 }).flag).toBe('OK');
    expect(reconcileNozzle({ opening: 0, closing: 5000, soldLitres: 4992, testLitres: 0 }).flag).toBe('OK');
    expect(reconcileNozzle({ opening: 0, closing: 5000, soldLitres: 4980, testLitres: 0 }).flag).toBe('UNRECORDED');
  });
  it('counts test litres as accounted for', () => {
    expect(reconcileNozzle({ opening: 10, closing: 70, soldLitres: 50, testLitres: 10 }).flag).toBe('OK');
  });
  it('does not drift on floating point sums', () => {
    expect(reconcileNozzle({ opening: 0.1, closing: 0.4, soldLitres: 0.3, testLitres: 0 }).unrecordedLitres).toBe(0);
  });
});

describe('meter gap', () => {
  it('reports how far an opening reading is from where the meter stopped', () => {
    expect(meterGap(1500, 1500)).toBe(0);
    expect(meterGap(1500, 1620.5)).toBe(120.5);
    expect(hasMeterGap(0.4)).toBe(false);
    expect(hasMeterGap(-12)).toBe(true);
  });
});

describe('wetStockStatus', () => {
  it('is fine inside a quarter percent', () => {
    expect(wetStockStatus(-10, 10_000)).toEqual({ variancePct: -0.1, status: 'OK' });
  });
  it('watches past a quarter and alerts past half a percent, in either direction', () => {
    expect(wetStockStatus(-35, 10_000).status).toBe('WATCH');
    expect(wetStockStatus(-80, 10_000).status).toBe('ALERT');
    expect(wetStockStatus(80, 10_000).status).toBe('ALERT');
  });
  it('judges a tank nobody sold from by litres', () => {
    expect(wetStockStatus(-5, 0).status).toBe('OK');
    expect(wetStockStatus(-50, 0).status).toBe('ALERT');
  });
});

describe('weightedAverageCost', () => {
  it('blends old and new fuel by litres', () => {
    expect(weightedAverageCost(1000, 15000, 1000, 16000)).toBe(15500);
  });
  it('takes the new cost when the tank is empty', () => {
    expect(weightedAverageCost(0, 15000, 5000, 16000)).toBe(16000);
    expect(weightedAverageCost(-30, 15000, 5000, 16000)).toBe(16000);
  });
  it('does not average against an unknown cost', () => {
    expect(weightedAverageCost(800, 0, 1000, 16000)).toBe(16000);
  });
});

describe('checkDelivery', () => {
  it('takes the docket when no dips were taken', () => {
    expect(checkDelivery({ docketLitres: 10_000 })).toMatchObject({ receivedLitres: 10_000, shortLitres: 0, isShort: false });
  });
  it('measures the tank when both dips are given', () => {
    const c = checkDelivery({ docketLitres: 10_000, dipBefore: 2000, dipAfter: 11_900 });
    expect(c).toMatchObject({ receivedLitres: 9900, shortLitres: 100, shortPct: 1, isShort: true });
  });
  it('lets a small shortfall pass', () => {
    expect(checkDelivery({ docketLitres: 10_000, dipBefore: 0, dipAfter: 9960 }).isShort).toBe(false);
  });
  it('ignores a single dip', () => {
    expect(checkDelivery({ docketLitres: 5000, dipBefore: 100 }).receivedLitres).toBe(5000);
  });
});

describe('cash and margin', () => {
  it('shows a shortage as negative', () => {
    expect(cashVariance(99_000, 100_000)).toBe(-1000);
    expect(cashVariance(101_000, 100_000)).toBe(1000);
  });
  it('works out margin only when the cost is known', () => {
    expect(marginCents(195_000, 10, 18_000)).toBe(15_000);
    expect(marginCents(195_000, 10, null)).toBeNull();
    expect(marginCents(195_000, 10, 0)).toBeNull();
  });
});
