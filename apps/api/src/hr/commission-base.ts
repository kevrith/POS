/**
 * What an employee's commission is worked out on: the value of the sales credited to them, and how many.
 *
 * Commission used to go to the cashier who rang a sale up. In a salon the stylist does the work and reception takes the
 * payment, so the stylist earned nothing and reception earned it all. A sale line can now name the staff member who
 * performed it; this decides who is credited:
 *
 *  - a sale with NO named staff on any line: the cashier, for the whole sale, exactly as before;
 *  - a sale with named staff: each named line goes to the person named, and any lines left unnamed stay with the cashier.
 *
 * A person is never credited twice for the same line, even when they were both cashier and stylist.
 */
export interface CommissionSale {
  id: string;
  totalCents: number;
  items: Array<{ totalCents: number; staffId: string | null }>;
}

export interface ServedLine {
  saleId: string;
  totalCents: number;
}

export function commissionBase(cashierSales: CommissionSale[], servedLines: ServedLine[]): { valueCents: number; count: number } {
  let valueCents = 0;
  let count = 0;

  for (const sale of cashierSales) {
    const items = sale.items ?? [];
    const named = items.some((i) => !!i.staffId);
    if (!named) {
      valueCents += sale.totalCents;
      count += 1;
      continue;
    }
    // Some lines belong to named staff; what is left unnamed stays with the cashier.
    const left = items.filter((i) => !i.staffId).reduce((sum, i) => sum + i.totalCents, 0);
    if (left > 0) {
      valueCents += left;
      count += 1;
    }
  }

  const served = new Set<string>();
  for (const line of servedLines) {
    valueCents += line.totalCents;
    served.add(line.saleId);
  }
  count += served.size;

  return { valueCents, count };
}

/** The commission itself, for a basis and rate as stored on an employee. GROSS_MARGIN needs cost data and earns nothing yet. */
export function commissionCents(basis: string | null | undefined, rate: number, base: { valueCents: number; count: number }): number {
  if (basis === 'SALES_VALUE') return Math.round(base.valueCents * (rate / 100));
  if (basis === 'TRANSACTION_COUNT') return Math.round(base.count * rate * 100);
  return 0;
}
