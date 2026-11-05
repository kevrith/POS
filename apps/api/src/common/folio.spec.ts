import { mergeByMethod, splitTenders } from './folio';

describe('splitTenders', () => {
  it('spends each tender on the receivable first, then the invoice, and the rest is change', () => {
    const r = splitTenders([{ method: 'CASH', amountCents: 1_500 }, { method: 'MPESA', amountCents: 1_000 }], 700, 1_500);
    expect(r.receivable).toEqual([{ method: 'CASH', amountCents: 700 }]);
    expect(r.invoice).toEqual([{ method: 'CASH', amountCents: 800 }, { method: 'MPESA', amountCents: 700 }]);
    expect(r.change).toEqual([{ method: 'MPESA', amountCents: 300 }]);
  });

  it('a tender can be split across both', () => {
    const r = splitTenders([{ method: 'DEPOSIT', amountCents: 500 }, { method: 'CASH', amountCents: 800 }], 700, 600);
    expect(r.receivable).toEqual([{ method: 'DEPOSIT', amountCents: 500 }, { method: 'CASH', amountCents: 200 }]);
    expect(r.invoice).toEqual([{ method: 'CASH', amountCents: 600 }]);
    expect(r.change).toEqual([]);
  });

  it('with nothing owed on the receivable, everything goes to the invoice', () => {
    const r = splitTenders([{ method: 'CASH', amountCents: 1_000 }], 0, 1_000);
    expect(r).toEqual({ receivable: [], invoice: [{ method: 'CASH', amountCents: 1_000 }], change: [] });
  });

  it('never allocates more than the tenders hold', () => {
    const r = splitTenders([{ method: 'CASH', amountCents: 100 }], 700, 600);
    expect(r.receivable).toEqual([{ method: 'CASH', amountCents: 100 }]);
    expect(r.invoice).toEqual([]);
  });
});

describe('mergeByMethod', () => {
  it('sums by method, keeping first-seen order', () => {
    expect(mergeByMethod([{ method: 'CASH', amountCents: 5 }, { method: 'MPESA', amountCents: 2 }, { method: 'CASH', amountCents: 3 }])).toEqual([
      { method: 'CASH', amountCents: 8 }, { method: 'MPESA', amountCents: 2 },
    ]);
  });
});
