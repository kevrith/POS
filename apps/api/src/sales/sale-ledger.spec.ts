import { buildSaleJournalLines, tenderAccount } from './sale-ledger';

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
