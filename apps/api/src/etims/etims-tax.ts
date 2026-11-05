import { STANDARD_VAT_RATE_PCT, isTaxClass, type TaxClass } from '@pos/shared';

/**
 * The tax half of an eTIMS invoice line, from what the sale stored.
 *
 * Every line used to go to KRA as standard-rated (`B`) with its price divided by 1.16, whatever the item was.
 * A line now carries the class it was sold under, its own VAT and its share of the discount. A line from before
 * classes existed (`taxClass` null) was taxed as standard-rated at the time, so it is described that way here.
 */
export interface StoredSaleLine {
  totalCents: number;
  discountCents?: number | null;
  vatCents?: number | null;
  taxClass?: string | null;
}

export interface EtimsLineTax {
  taxTyCd: TaxClass;
  /** Value before the discount. */
  supplyCents: number;
  discountCents: number;
  /** After the discount, VAT included: what was paid for the line. */
  amountCents: number;
  taxableCents: number;
  taxCents: number;
}

export function etimsLineTax(line: StoredSaleLine): EtimsLineTax {
  const discountCents = line.discountCents ?? 0;
  const amountCents = line.totalCents - discountCents;
  if (isTaxClass(line.taxClass)) {
    const taxCents = line.vatCents ?? 0;
    return { taxTyCd: line.taxClass, supplyCents: line.totalCents, discountCents, amountCents, taxableCents: amountCents - taxCents, taxCents };
  }
  // Legacy line: standard-rated, VAT extracted from the price.
  const taxCents = Math.round((amountCents * STANDARD_VAT_RATE_PCT) / (100 + STANDARD_VAT_RATE_PCT));
  return { taxTyCd: 'B', supplyCents: line.totalCents, discountCents, amountCents, taxableCents: amountCents - taxCents, taxCents };
}

export interface EtimsTaxTotals {
  taxblAmtA: number; taxblAmtB: number; taxblAmtC: number; taxblAmtD: number;
  taxAmtA: number; taxAmtB: number; taxAmtC: number; taxAmtD: number;
  totTaxblAmt: number;
  totTaxAmt: number;
}

const kes = (cents: number) => Math.round(cents) / 100;

/** The invoice-level taxable amounts and VAT, per class, as the sum of the lines. In KES. */
export function etimsTaxTotals(lines: EtimsLineTax[]): EtimsTaxTotals {
  const taxable: Record<TaxClass, number> = { A: 0, B: 0, C: 0, D: 0 };
  const tax: Record<TaxClass, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const l of lines) {
    taxable[l.taxTyCd] += l.taxableCents;
    tax[l.taxTyCd] += l.taxCents;
  }
  const totTaxbl = lines.reduce((s, l) => s + l.taxableCents, 0);
  const totTax = lines.reduce((s, l) => s + l.taxCents, 0);
  return {
    taxblAmtA: kes(taxable.A), taxblAmtB: kes(taxable.B), taxblAmtC: kes(taxable.C), taxblAmtD: kes(taxable.D),
    taxAmtA: kes(tax.A), taxAmtB: kes(tax.B), taxAmtC: kes(tax.C), taxAmtD: kes(tax.D),
    totTaxblAmt: kes(totTaxbl),
    totTaxAmt: kes(totTax),
  };
}
