/**
 * Pure helpers for the day-close (X / Z reading) screen.
 *
 * Kept free of React and react-native imports so the money maths and the
 * shareable receipt text can be unit-tested in plain Node — the screen itself is
 * covered by `npm run typecheck`.
 */

export interface DrawerSummary {
  totalSalesCents: number;
  salesCount: number;
  transactionCount: number;
  totalVatCents: number;
  cashSalesCents: number;
  mpesaSalesCents: number;
  otherPaymentsCents: number;
  refundsCents: number;
  cashRefundsCents: number;
  expensesCents: number;
  paymentBreakdown: Array<{ method: string; amountCents: number; count: number }>;
  expectedClosingCents: number;
}

export interface XReading {
  /** Present only when there is no open session. */
  error?: string;
  session: { id: string; openedAt: string; openingBalanceCents: number; tillNumber?: number | null } | null;
  summary: DrawerSummary | null;
  expectedCashCents?: number;
  generatedAt?: string;
}

export interface ZReport {
  zReportNumber: string;
  openedAt: string;
  closedAt: string;
  totalSales: number;
  totalRevenueCents: number;
  totalCashCents: number;
  openingBalanceCents: number;
  closingBalanceCents: number;
  expectedCashCents: number;
  varianceCents: number;
}

export type VarianceTone = 'balanced' | 'over' | 'short';

/**
 * How a cash variance should read to a human.
 *
 * Positive means MORE cash in the drawer than the system expected ("over"),
 * negative means missing ("short"). Getting this backwards would accuse an
 * honest cashier of theft, so it is pinned down by tests.
 */
export function varianceTone(cents: number): VarianceTone {
  if (cents === 0) return 'balanced';
  return cents > 0 ? 'over' : 'short';
}

export function varianceLabel(cents: number): string {
  const tone = varianceTone(cents);
  if (tone === 'balanced') return 'Balanced';
  return tone === 'over' ? 'Over' : 'Short';
}

/** KES formatting local to this module so the text builders stay pure. */
function kes(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function line(label: string, value: string, width = 34): string {
  const pad = Math.max(1, width - label.length - value.length);
  return `${label}${' '.repeat(pad)}${value}`;
}

/**
 * Parse a shop-floor cash amount typed as major units (shillings) into cents.
 *
 * Returns null for anything that isn't a usable number so the caller can block
 * the submit instead of silently posting a 0 count and reporting a huge shortfall.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Plain-text X reading, suitable for Share / print. */
export function formatXReadingText(x: XReading, storeName: string, cashierName: string): string {
  if (!x.session || !x.summary) return 'No open cash drawer session.';
  const s = x.summary;
  return [
    'X READING (mid-shift)',
    storeName,
    `Cashier: ${cashierName}`,
    x.session.tillNumber ? `Till: #${x.session.tillNumber}` : null,
    `Opened: ${new Date(x.session.openedAt).toLocaleString('en-KE')}`,
    `Printed: ${new Date(x.generatedAt ?? Date.now()).toLocaleString('en-KE')}`,
    '-'.repeat(34),
    line('Sales', String(s.salesCount)),
    line('Gross sales', kes(s.totalSalesCents)),
    line('VAT', kes(s.totalVatCents)),
    '-'.repeat(34),
    ...s.paymentBreakdown.map((p) => line(`${p.method} (${p.count})`, kes(p.amountCents))),
    '-'.repeat(34),
    line('Opening float', kes(x.session.openingBalanceCents)),
    line('Cash sales', kes(s.cashSalesCents)),
    line('Cash refunds', `-${kes(s.cashRefundsCents)}`),
    line('Cash paid out', `-${kes(s.expensesCents)}`),
    line('EXPECTED CASH', kes(s.expectedClosingCents)),
    '-'.repeat(34),
    'Drawer remains OPEN — this is a reading,',
    'not an end-of-day close.',
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

/** Plain-text Z report, suitable for Share / print / filing. */
export function formatZReportText(z: ZReport, storeName: string, cashierName: string): string {
  return [
    'Z REPORT (end of day)',
    z.zReportNumber,
    storeName,
    `Cashier: ${cashierName}`,
    `Opened: ${new Date(z.openedAt).toLocaleString('en-KE')}`,
    `Closed: ${new Date(z.closedAt).toLocaleString('en-KE')}`,
    '-'.repeat(34),
    line('Transactions', String(z.totalSales)),
    line('Total revenue', kes(z.totalRevenueCents)),
    line('Cash takings', kes(z.totalCashCents)),
    '-'.repeat(34),
    line('Opening float', kes(z.openingBalanceCents)),
    line('Expected cash', kes(z.expectedCashCents)),
    line('Counted cash', kes(z.closingBalanceCents)),
    line(
      varianceLabel(z.varianceCents).toUpperCase(),
      `${z.varianceCents >= 0 ? '+' : '-'}${kes(Math.abs(z.varianceCents))}`,
    ),
  ].join('\n');
}
