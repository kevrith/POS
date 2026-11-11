import { buildSaleJournalLines, buildTipJournalLines, postTipJournal, tenderAccount } from './sale-ledger';

describe('sale journal for a room charge', () => {
  it('owes the money to the business as a receivable, not as bank receipts', () => {
    expect(tenderAccount('ROOM_CHARGE')).toEqual({ code: '1200', name: 'Accounts Receivable' });
    const lines = buildSaleJournalLines({
      businessId: 'b', storeId: 's', receiptNumber: 'R1', isCredit: false, totalCents: 11_600, vatCents: 1_600, totCents: 0,
      serviceChargeCents: 0, tipCents: 0, payments: [{ method: 'CASH', amountCents: 1_600 }, { method: 'ROOM_CHARGE', amountCents: 10_000 }],
    });
    expect(lines.filter((l) => l.debitCents > 0).map((l) => [l.accountCode, l.debitCents])).toEqual([['1000', 1_600], ['1200', 10_000]]);
  });
});

describe('tip journal', () => {
  it('debits what the tip was paid by and credits Tips Payable, and balances', () => {
    for (const method of ['CASH', 'MPESA', 'CARD', 'BANK']) {
      const lines = buildTipJournalLines(method, 50000);
      expect(lines).toHaveLength(2);
      expect(lines.reduce((s, l) => s + l.debitCents, 0)).toBe(50000);
      expect(lines.reduce((s, l) => s + l.creditCents, 0)).toBe(50000);
      expect(lines.find((l) => l.creditCents > 0)?.accountCode).toBe('2200');
    }
    expect(buildTipJournalLines('CASH', 100)[0]).toMatchObject({ accountCode: '1000', debitCents: 100 });
    expect(buildTipJournalLines('MPESA', 100)[0]).toMatchObject({ accountCode: '1010' });
  });

  it('writes nothing for no tip', () => {
    expect(buildTipJournalLines('CASH', 0)).toEqual([]);
    expect(buildTipJournalLines('CASH', -5)).toEqual([]);
  });

  it('posts the lines to the ledger as a tip, tied to its reference', async () => {
    const autoPost = jest.fn().mockResolvedValue(undefined);
    await postTipJournal({ autoPost } as any, { businessId: 'b', storeId: 's', description: 'Tip', reference: 'TIP-1', method: 'CASH', amountCents: 200 });
    expect(autoPost).toHaveBeenCalledWith(expect.objectContaining({ reference: 'TIP-1', sourceType: 'TIP', lines: expect.any(Array) }));
    await postTipJournal({ autoPost } as any, { businessId: 'b', description: 'Tip', reference: 'TIP-2', method: 'CASH', amountCents: 0 });
    expect(autoPost).toHaveBeenCalledTimes(1);
  });
});
