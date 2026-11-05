import { etimsLineTax, etimsTaxTotals } from './etims-tax';

describe('etimsLineTax', () => {
  it('reports a classified line under its own class with its own VAT', () => {
    expect(etimsLineTax({ totalCents: 11600, vatCents: 1600, discountCents: 0, taxClass: 'B' })).toEqual({
      taxTyCd: 'B', supplyCents: 11600, discountCents: 0, amountCents: 11600, taxableCents: 10000, taxCents: 1600,
    });
    expect(etimsLineTax({ totalCents: 15000, vatCents: 0, discountCents: 0, taxClass: 'A' })).toEqual({
      taxTyCd: 'A', supplyCents: 15000, discountCents: 0, amountCents: 15000, taxableCents: 15000, taxCents: 0,
    });
    expect(etimsLineTax({ totalCents: 2000, taxClass: 'C' }).taxTyCd).toBe('C');
    expect(etimsLineTax({ totalCents: 900, taxClass: 'D' }).taxTyCd).toBe('D');
  });

  it('works on the amount paid, after the line\'s share of the discount', () => {
    const t = etimsLineTax({ totalCents: 11600, discountCents: 1160, vatCents: 1440, taxClass: 'B' });
    expect(t.supplyCents).toBe(11600);
    expect(t.discountCents).toBe(1160);
    expect(t.amountCents).toBe(10440);
    expect(t.taxableCents + t.taxCents).toBe(10440);
  });

  it('describes a line from before classes existed as standard-rated, VAT extracted from the price', () => {
    const t = etimsLineTax({ totalCents: 11600, taxClass: null });
    expect(t).toEqual({ taxTyCd: 'B', supplyCents: 11600, discountCents: 0, amountCents: 11600, taxableCents: 10000, taxCents: 1600 });
    expect(etimsLineTax({ totalCents: 500 }).taxTyCd).toBe('B');
  });

  it('never invents a class: an unrecognised one is treated as a legacy line', () => {
    expect(etimsLineTax({ totalCents: 11600, taxClass: 'Z' }).taxTyCd).toBe('B');
  });
});

describe('etimsTaxTotals', () => {
  it('sums taxable amounts and VAT per class, in KES', () => {
    const lines = [
      etimsLineTax({ totalCents: 11600, vatCents: 1600, taxClass: 'B' }),
      etimsLineTax({ totalCents: 23200, vatCents: 3200, taxClass: 'B' }),
      etimsLineTax({ totalCents: 15000, vatCents: 0, taxClass: 'A' }),
      etimsLineTax({ totalCents: 5000, vatCents: 0, taxClass: 'C' }),
    ];
    expect(etimsTaxTotals(lines)).toEqual({
      taxblAmtA: 150, taxblAmtB: 300, taxblAmtC: 50, taxblAmtD: 0,
      taxAmtA: 0, taxAmtB: 48, taxAmtC: 0, taxAmtD: 0,
      totTaxblAmt: 500,
      totTaxAmt: 48,
    });
  });

  it('a flour-only sale has no taxable class B at all', () => {
    const t = etimsTaxTotals([etimsLineTax({ totalCents: 20000, vatCents: 0, taxClass: 'A' })]);
    expect(t.taxblAmtB).toBe(0);
    expect(t.taxAmtB).toBe(0);
    expect(t.taxblAmtA).toBe(200);
  });

  it('the class totals add up to the overall totals', () => {
    const lines = [etimsLineTax({ totalCents: 3333, vatCents: 460, discountCents: 33, taxClass: 'B' }), etimsLineTax({ totalCents: 777, taxClass: 'D' })];
    const t = etimsTaxTotals(lines);
    expect(Math.round((t.taxblAmtA + t.taxblAmtB + t.taxblAmtC + t.taxblAmtD) * 100)).toBe(Math.round(t.totTaxblAmt * 100));
    expect(Math.round((t.taxAmtA + t.taxAmtB + t.taxAmtC + t.taxAmtD) * 100)).toBe(Math.round(t.totTaxAmt * 100));
  });
});
