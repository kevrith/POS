import { ReconciliationService } from './reconciliation.service';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    bankStatement: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    bankStatementEntry: {
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    sale: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
    },
  };
}

function makeService() {
  const prisma = makePrisma();
  const svc = new ReconciliationService(prisma as any);
  return { svc, prisma };
}

// ─── parseMoney ───────────────────────────────────────────────────────────────

describe('ReconciliationService.parseMoney (private)', () => {
  let svc: ReconciliationService;
  beforeEach(() => ({ svc } = makeService()));

  const parse = (s: ReconciliationService, str: string) =>
    (s as any).parseMoney(str) as number;

  it('parses a plain integer string', () => {
    expect(parse(svc, '1000')).toBe(100000);
  });

  it('parses a decimal amount', () => {
    expect(parse(svc, '1500.50')).toBe(150050);
  });

  it('strips commas from thousands-formatted amounts', () => {
    expect(parse(svc, '10,500.00')).toBe(1050000);
  });

  it('strips currency symbols (KES, KSH, Ksh)', () => {
    expect(parse(svc, 'KES 2,500.00')).toBe(250000);
    expect(parse(svc, 'KSH500')).toBe(50000);
    expect(parse(svc, 'Ksh 750.25')).toBe(75025);
  });

  it('returns 0 for empty or non-numeric strings', () => {
    expect(parse(svc, '')).toBe(0);
    expect(parse(svc, '-')).toBe(0);
    expect(parse(svc, 'N/A')).toBe(0);
  });

  it('handles quoted amounts (from CSV quotes)', () => {
    expect(parse(svc, '"3,000.00"')).toBe(300000);
  });
});

// ─── parseCSV ─────────────────────────────────────────────────────────────────

describe('ReconciliationService.parseCSV (private)', () => {
  let svc: ReconciliationService;
  beforeEach(() => ({ svc } = makeService()));

  const parse = (s: ReconciliationService, csv: string) =>
    (s as any).parseCSV(csv) as any[];

  it('returns empty array for single-line CSV (header only)', () => {
    const result = parse(svc, 'Date,Description,Debit,Credit,Balance');
    expect(result).toHaveLength(0);
  });

  it('parses standard KCB format: Date, Description, Debit, Credit, Balance, Reference', () => {
    const csv = `Date,Description,Debit,Credit,Balance,Reference
2026-03-01,M-Pesa from John,0,5000.00,10000.00,REF123
2026-03-02,ATM Withdrawal,2000.00,0,8000.00,ATM001`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(2);

    const credit = entries[0];
    expect(credit.creditCents).toBe(500000);
    expect(credit.debitCents).toBe(0);
    expect(credit.description).toBe('M-Pesa from John');
    expect(credit.reference).toBe('REF123');

    const debit = entries[1];
    expect(debit.debitCents).toBe(200000);
    expect(debit.creditCents).toBe(0);
  });

  it('parses DD/MM/YYYY date format', () => {
    const csv = `Date,Description,Debit,Credit,Balance
15/03/2026,Coffee Sale,0,500.00,5000.00`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(1);
    const date = entries[0].date as Date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(date.getDate()).toBe(15);
  });

  it('parses ISO YYYY-MM-DD date format', () => {
    const csv = `Date,Description,Debit,Credit,Balance
2026-03-10,Payment,0,1000.00,2000.00`;
    const entries = parse(svc, csv);
    expect(entries[0].date.getFullYear()).toBe(2026);
    expect(entries[0].date.getDate()).toBe(10);
  });

  it('handles quoted CSV fields with commas inside', () => {
    const csv = `Date,Description,Debit,Credit,Balance
2026-03-05,"Transfer from Nairobi, Branch",0,"12,500.00",50000.00`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('Transfer from Nairobi, Branch');
    expect(entries[0].creditCents).toBe(1250000);
  });

  it('skips rows with invalid dates', () => {
    const csv = `Date,Description,Debit,Credit,Balance
not-a-date,Bad row,0,500.00,5000.00
2026-03-01,Good row,0,1000.00,6000.00`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].description).toBe('Good row');
  });

  it('skips rows with fewer than 3 columns', () => {
    const csv = `Date,Description,Debit,Credit,Balance
2026-03-01,Incomplete row`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(0);
  });

  it('correctly identifies debit/credit columns when header specifies order (credit before debit)', () => {
    // Equity Bank format: Date, Description, Credit, Debit, Balance
    const csv = `Date,Description,Credit,Debit,Balance
2026-03-01,Customer Payment,8000.00,0,20000.00`;
    const entries = parse(svc, csv);
    expect(entries).toHaveLength(1);
    expect(entries[0].creditCents).toBe(800000);
    expect(entries[0].debitCents).toBe(0);
  });

  it('handles file with no header row (data starts immediately)', () => {
    // No "Date" or "Description" keyword in first line
    const csv = `2026-03-01,Direct entry,0,2000.00,10000.00
2026-03-02,Another,500.00,0,9500.00`;
    const entries = parse(svc, csv);
    // All lines treated as data (no header detected)
    expect(entries.length).toBeGreaterThan(0);
  });
});

// ─── autoMatch ────────────────────────────────────────────────────────────────

describe('ReconciliationService.autoMatch', () => {
  it('matches entry to sale by amount + date proximity', async () => {
    const { svc, prisma } = makeService();

    const entryDate = new Date('2026-03-05');
    prisma.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-001',
        date: entryDate,
        creditCents: 500000,
        reference: null,
        matchStatus: 'UNMATCHED',
      },
    ]);

    // Amount match found
    prisma.sale.findMany.mockResolvedValue([{ id: 'sale-001', receiptNumber: 'NRB01-2026-0000001' }]);
    prisma.bankStatementEntry.update.mockResolvedValue({});

    await svc.autoMatch('stmt-001', 'biz-001');

    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ totalCents: 500000 }),
      }),
    );
    expect(prisma.bankStatementEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-001' },
      data: { matchedSaleId: 'sale-001', matchStatus: 'MATCHED' },
    });
  });

  it('falls back to reference match when no amount match found', async () => {
    const { svc, prisma } = makeService();

    prisma.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-002',
        date: new Date('2026-03-06'),
        creditCents: 750000,
        reference: 'NRB01-2026-0000042',
        matchStatus: 'UNMATCHED',
      },
    ]);

    // No amount match
    prisma.sale.findMany.mockResolvedValue([]);
    // Reference match
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-042' });
    prisma.bankStatementEntry.update.mockResolvedValue({});

    await svc.autoMatch('stmt-002', 'biz-001');

    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiptNumber: { contains: 'NRB01-2026-0000042' } }),
      }),
    );
    expect(prisma.bankStatementEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-002' },
      data: { matchedSaleId: 'sale-042', matchStatus: 'MATCHED' },
    });
  });

  it('does not update entry when no match is found', async () => {
    const { svc, prisma } = makeService();

    prisma.bankStatementEntry.findMany.mockResolvedValue([
      {
        id: 'entry-003',
        date: new Date('2026-03-07'),
        creditCents: 999999,
        reference: null,
        matchStatus: 'UNMATCHED',
      },
    ]);

    prisma.sale.findMany.mockResolvedValue([]); // no amount match
    // no reference to try

    await svc.autoMatch('stmt-003', 'biz-001');

    expect(prisma.bankStatementEntry.update).not.toHaveBeenCalled();
  });

  it('only processes UNMATCHED credit entries', async () => {
    const { svc, prisma } = makeService();

    prisma.bankStatementEntry.findMany.mockResolvedValue([]); // query returns empty

    await svc.autoMatch('stmt-004', 'biz-001');

    // Query should filter by matchStatus + creditCents > 0
    expect(prisma.bankStatementEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          matchStatus: 'UNMATCHED',
          creditCents: { gt: 0 },
        }),
      }),
    );
    expect(prisma.bankStatementEntry.update).not.toHaveBeenCalled();
  });

  it('uses ±2 day window for date proximity in amount match', async () => {
    const { svc, prisma } = makeService();
    const entryDate = new Date('2026-03-10T00:00:00.000Z');

    prisma.bankStatementEntry.findMany.mockResolvedValue([
      { id: 'entry-005', date: entryDate, creditCents: 100000, reference: null, matchStatus: 'UNMATCHED' },
    ]);
    prisma.sale.findMany.mockResolvedValue([]);

    await svc.autoMatch('stmt-005', 'biz-001');

    const callArgs = prisma.sale.findMany.mock.calls[0][0];
    const dateFilter = callArgs.where.createdAt;

    const minDiff = entryDate.getTime() - dateFilter.gte.getTime();
    const maxDiff = dateFilter.lte.getTime() - entryDate.getTime();

    expect(minDiff).toBeCloseTo(2 * 86400000, -2); // ~2 days before
    expect(maxDiff).toBeCloseTo(2 * 86400000, -2); // ~2 days after
  });
});
