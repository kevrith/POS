import {
  varianceTone,
  varianceLabel,
  parseAmountToCents,
  formatXReadingText,
  formatZReportText,
  type XReading,
  type ZReport,
  type DrawerSummary,
} from '../lib/dayClose';

const summary: DrawerSummary = {
  totalSalesCents: 125_000,
  salesCount: 12,
  transactionCount: 12,
  totalVatCents: 17_241,
  cashSalesCents: 80_000,
  mpesaSalesCents: 45_000,
  otherPaymentsCents: 0,
  refundsCents: 0,
  cashRefundsCents: 1_000,
  expensesCents: 2_000,
  paymentBreakdown: [
    { method: 'CASH', amountCents: 80_000, count: 8 },
    { method: 'MPESA', amountCents: 45_000, count: 4 },
  ],
  expectedClosingCents: 87_000,
};

const xReading: XReading = {
  session: { id: 'sess-1', openedAt: '2026-08-13T06:00:00.000Z', openingBalanceCents: 10_000, tillNumber: 2 },
  summary,
  expectedCashCents: 87_000,
  generatedAt: '2026-08-13T14:00:00.000Z',
};

describe('varianceTone', () => {
  // Getting this backwards would accuse an honest cashier of being short when
  // the drawer is actually over — worth pinning down explicitly.
  it('reads a positive variance as over and a negative one as short', () => {
    expect(varianceTone(500)).toBe('over');
    expect(varianceTone(-500)).toBe('short');
    expect(varianceTone(0)).toBe('balanced');
  });

  it('labels each tone for humans', () => {
    expect(varianceLabel(0)).toBe('Balanced');
    expect(varianceLabel(250)).toBe('Over');
    expect(varianceLabel(-250)).toBe('Short');
  });
});

describe('parseAmountToCents', () => {
  it('converts shillings to cents', () => {
    expect(parseAmountToCents('125')).toBe(12_500);
    expect(parseAmountToCents('125.50')).toBe(12_550);
    expect(parseAmountToCents('0')).toBe(0);
  });

  it('tolerates thousands separators and surrounding spaces', () => {
    expect(parseAmountToCents(' 12,500.25 ')).toBe(1_250_025);
  });

  it('rounds sub-cent input rather than truncating', () => {
    expect(parseAmountToCents('0.005')).toBe(1);
  });

  // Returning 0 for junk would post a Z report claiming the whole float is
  // missing, so unusable input must be distinguishable from a real zero.
  it('returns null for empty, non-numeric and negative input', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-100')).toBeNull();
    expect(parseAmountToCents('NaN')).toBeNull();
  });
});

describe('formatXReadingText', () => {
  it('includes the totals a manager checks a till against', () => {
    const text = formatXReadingText(xReading, 'Nairobi CBD', 'Grace');
    expect(text).toContain('X READING');
    expect(text).toContain('Nairobi CBD');
    expect(text).toContain('Grace');
    expect(text).toContain('Till: #2');
    expect(text).toContain('CASH (8)');
    expect(text).toContain('MPESA (4)');
    expect(text).toContain('EXPECTED CASH');
    expect(text).toContain('870.00');
  });

  it('says the drawer stays open, so it is never mistaken for a Z', () => {
    expect(formatXReadingText(xReading, 'Store', 'Grace')).toContain('remains OPEN');
  });

  it('degrades to a plain message when there is no open session', () => {
    const none: XReading = { error: 'No open cash drawer session', session: null, summary: null };
    expect(formatXReadingText(none, 'Store', 'Grace')).toBe('No open cash drawer session.');
  });
});

describe('formatZReportText', () => {
  const z: ZReport = {
    zReportNumber: 'Z-NRB01-2026-0007',
    openedAt: '2026-08-13T06:00:00.000Z',
    closedAt: '2026-08-13T18:00:00.000Z',
    totalSales: 12,
    totalRevenueCents: 125_000,
    totalCashCents: 80_000,
    openingBalanceCents: 10_000,
    closingBalanceCents: 86_500,
    expectedCashCents: 87_000,
    varianceCents: -500,
  };

  it('carries the fiscal number and the signed variance', () => {
    const text = formatZReportText(z, 'Nairobi CBD', 'Grace');
    expect(text).toContain('Z REPORT');
    expect(text).toContain('Z-NRB01-2026-0007');
    expect(text).toContain('SHORT');
    expect(text).toContain('-KES 5.00');
  });

  it('marks a balanced till as balanced with a + sign', () => {
    const text = formatZReportText({ ...z, closingBalanceCents: 87_000, varianceCents: 0 }, 'S', 'G');
    expect(text).toContain('BALANCED');
    expect(text).toContain('+KES 0.00');
  });
});
