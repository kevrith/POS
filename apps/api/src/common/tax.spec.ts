import { allocateByValue, computeTaxes, taxClassOf, parseTaxClass, calculateVAT, type TaxClass } from '@pos/shared';

const line = (totalCents: number, taxClass: TaxClass) => ({ totalCents, taxClass });

describe('taxClassOf', () => {
  it('uses the class when there is one', () => {
    expect(taxClassOf({ taxClass: 'C', vatApplicable: true })).toBe('C');
    expect(taxClassOf({ taxClass: 'A' })).toBe('A');
  });
  it('is standard-rated when there is no class, and never reads the old yes/no flag', () => {
    expect(taxClassOf({})).toBe('B');
    expect(taxClassOf({ taxClass: null })).toBe('B');
    expect(taxClassOf({ taxClass: 'nonsense' })).toBe('B');
    // The create form defaulted this to false, so false does not mean exempt.
    expect(taxClassOf({ vatApplicable: false })).toBe('B');
    expect(taxClassOf({ taxClass: undefined, vatApplicable: false })).toBe('B');
  });
});

describe('allocateByValue', () => {
  it('always adds up to the amount, to the cent', () => {
    for (const [values, amount] of [[[333, 333, 334], 100], [[1, 1, 1], 2], [[10000, 1, 1], 7], [[500, 500], 1], [[999, 1], 500]] as const) {
      const out = allocateByValue([...values], amount);
      expect(out.reduce((a, b) => a + b, 0)).toBe(amount);
      out.forEach((share, i) => expect(share).toBeLessThanOrEqual(values[i]));
    }
  });
  it('shares in proportion to value', () => {
    expect(allocateByValue([1000, 3000], 400)).toEqual([100, 300]);
  });
  it('gives nothing when there is nothing to share, and never more than the lines are worth', () => {
    expect(allocateByValue([100, 200], 0)).toEqual([0, 0]);
    expect(allocateByValue([100, 200], -5)).toEqual([0, 0]);
    expect(allocateByValue([], 10)).toEqual([]);
    expect(allocateByValue([100, 200], 99999)).toEqual([100, 200]);
  });
  it('ignores negative lines when weighing', () => {
    expect(allocateByValue([1000, -500], 100)).toEqual([100, 0]);
  });
});

describe('computeTaxes', () => {
  const reg = { vatRegistered: true };

  it('extracts 16/116 from standard-rated lines only', () => {
    const t = computeTaxes([line(11600, 'B'), line(5000, 'A'), line(2000, 'C'), line(900, 'D')], 0, reg);
    expect(t.lines.map((l) => l.vatCents)).toEqual([1600, 0, 0, 0]);
    expect(t.vatCents).toBe(1600);
    expect(t.byClass.A).toEqual({ netCents: 5000, vatCents: 0 });
    expect(t.byClass.B).toEqual({ netCents: 11600, vatCents: 1600 });
    expect(t.byClass.C.netCents).toBe(2000);
    expect(t.byClass.D.netCents).toBe(900);
  });

  it('a flour-only basket has no VAT at all (the old maths charged 16/116 of it)', () => {
    const t = computeTaxes([line(15000, 'A'), line(20000, 'A')], 0, reg);
    expect(t.vatCents).toBe(0);
    expect(calculateVAT(35000)).toBe(4828);
  });

  it('a discount comes off each line in proportion, and VAT follows the discounted amount', () => {
    // 10,000 standard + 10,000 exempt, 2,000 off: 1,000 each.
    const t = computeTaxes([line(10000, 'B'), line(10000, 'A')], 2000, reg);
    expect(t.lines.map((l) => l.discountCents)).toEqual([1000, 1000]);
    expect(t.lines.map((l) => l.netCents)).toEqual([9000, 9000]);
    expect(t.vatCents).toBe(Math.round((9000 * 16) / 116));
  });

  it('line figures add up exactly, whatever the rounding', () => {
    const lines = [line(333, 'B'), line(333, 'B'), line(334, 'A'), line(1001, 'B')];
    const t = computeTaxes(lines, 77, reg);
    expect(t.lines.reduce((s, l) => s + l.discountCents, 0)).toBe(77);
    expect(t.lines.reduce((s, l) => s + l.netCents, 0)).toBe(333 + 333 + 334 + 1001 - 77);
    expect(t.vatCents).toBe(t.lines.reduce((s, l) => s + l.vatCents, 0));
    expect(t.vatCents).toBe(t.byClass.B.vatCents);
  });

  it('a business that is not VAT-registered charges none, and every line is class D', () => {
    const t = computeTaxes([line(11600, 'B'), line(5000, 'A')], 0, { vatRegistered: false });
    expect(t.vatCents).toBe(0);
    expect(t.lines.every((l) => l.taxClass === 'D')).toBe(true);
    expect(t.byClass.D.netCents).toBe(16600);
  });

  it('a 100% discount leaves nothing to tax', () => {
    const t = computeTaxes([line(11600, 'B')], 11600, reg);
    expect(t.vatCents).toBe(0);
    expect(t.lines[0].netCents).toBe(0);
  });

  it('a manager discount line (negative) lowers the standard-rated total', () => {
    const t = computeTaxes([line(11600, 'B'), line(-1160, 'B')], 0, reg);
    expect(t.vatCents).toBe(1440); // 10,440 x 16/116
    expect(t.byClass.B.netCents).toBe(10440);
  });

  it('matches the old whole-sale figure when every line is standard-rated and nothing is discounted', () => {
    const t = computeTaxes([line(11600, 'B'), line(23200, 'B')], 0, reg);
    expect(t.vatCents).toBe(calculateVAT(34800));
  });
});

describe('parseTaxClass', () => {
  it('reads the letter or the word, in any case', () => {
    for (const t of ['A', 'a', 'Exempt', ' vat exempt ']) expect(parseTaxClass(t)).toBe('A');
    for (const t of ['B', 'standard', 'Standard rate', '16%', '16', 'VAT']) expect(parseTaxClass(t)).toBe('B');
    for (const t of ['C', 'zero-rated', 'Zero rated', '0%']) expect(parseTaxClass(t)).toBe('C');
    for (const t of ['D', 'non-VAT', 'not vat', 'NONE']) expect(parseTaxClass(t)).toBe('D');
  });
  it('blank means not said, and nonsense is rejected rather than guessed', () => {
    expect(parseTaxClass('')).toBeUndefined();
    expect(parseTaxClass(undefined)).toBeUndefined();
    expect(parseTaxClass('   ')).toBeUndefined();
    expect(parseTaxClass('E')).toBeNull();
    expect(parseTaxClass('maybe')).toBeNull();
  });
});
