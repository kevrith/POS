import { EtimsService } from './etims.service';

/**
 * The KRA payload is only built in PRODUCTION mode, which sandbox runs never reach. These drive the two builders
 * (invoice and credit note) with KRA's HTTP call and the credential decryption stubbed, and read what would be sent.
 */
function build() {
  const prisma: any = {
    sale: { findUnique: jest.fn() },
    customer: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const svc: any = new EtimsService(prisma, { createEntry: jest.fn() } as any);
  svc.decryptCredentials = jest.fn().mockReturnValue({ kraPin: 'P000000000A', branchId: '00' });
  svc.callEtimsApiWithAuth = jest.fn().mockResolvedValue({ controlNo: 'CN-1', intrlData: 'SIG' });
  return { prisma, svc };
}

const item = (o: Record<string, any>) => ({ barcode: null, sku: null, kraItemCode: null, ...o });
const line = (o: Record<string, any>) => ({ id: 'l', quantity: 1, unitPriceCents: 0, discountCents: 0, vatCents: 0, ...o });

describe('eTIMS invoice payload', () => {
  async function invoiceFor(items: any[], saleOver: Record<string, any> = {}) {
    const { prisma, svc } = build();
    const sale = { id: 's1', receiptNumber: 'R-1', createdAt: new Date('2026-11-05T09:00:00Z'), totalCents: items.reduce((s, i) => s + i.totalCents - (i.discountCents ?? 0), 0), vatCents: 0, customerId: null, ...saleOver };
    prisma.sale.findUnique.mockResolvedValue({ ...sale, items, payments: [{ method: 'CASH', amountCents: sale.totalCents }] });
    await svc.submitToEtims(sale, { etimsCredentialsEncrypted: 'enc' });
    return svc.callEtimsApiWithAuth.mock.calls[0][2];
  }

  it('sends each line under its own tax class with its own amounts', async () => {
    const p = await invoiceFor([
      line({ totalCents: 11_600, unitPriceCents: 11_600, taxClass: 'B', vatCents: 1_600, item: item({ name: 'Milk' }) }),
      line({ totalCents: 20_000, unitPriceCents: 20_000, taxClass: 'A', item: item({ name: 'Maize flour' }) }),
      line({ totalCents: 5_000, unitPriceCents: 5_000, taxClass: 'C', item: item({ name: 'Exercise book' }) }),
    ]);
    expect(p.itemList.map((l: any) => [l.itemNm, l.taxTyCd, l.taxAmt, l.taxblAmt, l.totAmt])).toEqual([
      ['Milk', 'B', 16, 100, 116],
      ['Maize flour', 'A', 0, 200, 200],
      ['Exercise book', 'C', 0, 50, 50],
    ]);
  });

  it('puts taxable amounts and VAT in the right class totals', async () => {
    const p = await invoiceFor([
      line({ totalCents: 11_600, taxClass: 'B', vatCents: 1_600, item: item({ name: 'Milk' }) }),
      line({ totalCents: 20_000, taxClass: 'A', item: item({ name: 'Flour' }) }),
    ]);
    expect(p).toEqual(expect.objectContaining({ taxblAmtA: 200, taxblAmtB: 100, taxblAmtC: 0, taxblAmtD: 0, taxAmtA: 0, taxAmtB: 16, totTaxblAmt: 300, totTaxAmt: 16 }));
  });

  it('a flour-only sale has nothing in the standard-rated class', async () => {
    const p = await invoiceFor([line({ totalCents: 20_000, taxClass: 'A', item: item({ name: 'Flour' }) })]);
    expect(p.taxblAmtB).toBe(0);
    expect(p.taxAmtB).toBe(0);
    expect(p.totTaxAmt).toBe(0);
    expect(p.itemList[0].taxTyCd).toBe('A');
  });

  it('shows the discount on the line and taxes the discounted amount', async () => {
    const p = await invoiceFor([line({ totalCents: 11_600, discountCents: 1_160, taxClass: 'B', vatCents: 1_440, item: item({ name: 'Milk' }) })]);
    const l = p.itemList[0];
    expect(l).toEqual(expect.objectContaining({ splyAmt: 116, dcAmt: 11.6, dcRt: 10, totAmt: 104.4, taxAmt: 14.4, taxblAmt: 90 }));
  });

  it('describes a line from before classes as standard-rated, as it always was', async () => {
    const p = await invoiceFor([line({ totalCents: 11_600, taxClass: null, item: item({ name: 'Old line' }) })]);
    expect(p.itemList[0]).toEqual(expect.objectContaining({ taxTyCd: 'B', taxAmt: 16, taxblAmt: 100 }));
    expect(p.taxblAmtB).toBe(100);
    expect(p.taxAmtB).toBe(16);
  });
});

describe('eTIMS credit note payload', () => {
  it('refunds the returned lines under the class they were sold under, net of their discount', async () => {
    const { svc } = build();
    const sale = {
      receiptNumber: 'R-1', etimsControlNumber: 'CN-1',
      items: [
        line({ id: 'a', totalCents: 11_600, discountCents: 1_160, taxClass: 'B', vatCents: 1_440, item: item({ name: 'Milk' }) }),
        line({ id: 'b', totalCents: 20_000, taxClass: 'A', item: item({ name: 'Flour' }) }),
      ],
    };
    await svc.submitToEtimsCreditNote({ returnedItemIds: JSON.stringify(['a', 'b']) }, sale, { etimsCredentialsEncrypted: 'enc' });
    const p = svc.callEtimsApiWithAuth.mock.calls[0][2];
    expect(p.rcptTyCd).toBe('R');
    expect(p.itemList.map((l: any) => [l.taxTyCd, l.totAmt])).toEqual([['B', 104.4], ['A', 200]]);
    expect(p.totAmt).toBe(304.4);
    expect(p).toEqual(expect.objectContaining({ taxblAmtA: 200, taxblAmtB: 90, taxAmtB: 14.4, totTaxAmt: 14.4 }));
  });

  it('a partial return only includes the lines returned', async () => {
    const { svc } = build();
    const sale = {
      receiptNumber: 'R-1', etimsControlNumber: 'CN-1',
      items: [line({ id: 'a', totalCents: 11_600, taxClass: 'B', vatCents: 1_600, item: item({ name: 'Milk' }) }), line({ id: 'b', totalCents: 20_000, taxClass: 'A', item: item({ name: 'Flour' }) })],
    };
    await svc.submitToEtimsCreditNote({ returnedItemIds: JSON.stringify(['b']) }, sale, { etimsCredentialsEncrypted: 'enc' });
    const p = svc.callEtimsApiWithAuth.mock.calls[0][2];
    expect(p.itemList).toHaveLength(1);
    expect(p).toEqual(expect.objectContaining({ totAmt: 200, taxblAmtB: 0, taxAmtB: 0, taxblAmtA: 200 }));
  });
});
