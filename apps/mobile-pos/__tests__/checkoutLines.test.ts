import { toCheckoutLines, markdownPerUnit, overrideAllowed } from '../lib/checkoutLines';
import type { CartItem } from '../stores/cart';

const line = (over: Partial<CartItem> = {}): CartItem => ({
  id: 'i1', name: 'Americano', quantity: 1, discountPercent: 0,
  unitPriceCents: 25000, originalPriceCents: 25000, catalogPriceCents: 25000, ...over,
});

describe('toCheckoutLines', () => {
  it('sends only the item and quantity, never a price the server would ignore', () => {
    const { lines } = toCheckoutLines([line({ quantity: 3 })]);
    expect(lines).toEqual([{ itemId: 'i1', quantity: 3 }]);
  });

  it('has no markdown when nothing was discounted', () => {
    expect(toCheckoutLines([line({ quantity: 2 })]).lineDiscountCents).toBe(0);
  });

  it('turns a per-item percent discount into a sale discount at catalog price', () => {
    // 10% off 250.00 = 225.00, two of them: the till shows 450.00, the server must charge 500.00 - 50.00
    const item = line({ quantity: 2, discountPercent: 10, unitPriceCents: 22500 });
    expect(toCheckoutLines([item]).lineDiscountCents).toBe(5000);
  });

  it('turns a lowered price override into a sale discount', () => {
    const item = line({ quantity: 4, unitPriceCents: 20000, originalPriceCents: 20000 });
    expect(toCheckoutLines([item]).lineDiscountCents).toBe(20000);
  });

  it('adds up several marked-down lines and ignores untouched ones', () => {
    const items = [
      line({ id: 'a', quantity: 1, unitPriceCents: 24000 }),
      line({ id: 'b', quantity: 2, unitPriceCents: 25000 }),
      line({ id: 'c', quantity: 3, unitPriceCents: 24900 }),
    ];
    expect(toCheckoutLines(items).lineDiscountCents).toBe(1000 + 0 + 300);
  });

  it('server total equals the till total: catalog subtotal minus the markdown', () => {
    const items = [line({ quantity: 2, unitPriceCents: 22500 }), line({ id: 'b', quantity: 1, unitPriceCents: 10000, catalogPriceCents: 10000, originalPriceCents: 10000 })];
    const tillTotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
    const catalogTotal = items.reduce((s, i) => s + i.catalogPriceCents * i.quantity, 0);
    expect(catalogTotal - toCheckoutLines(items).lineDiscountCents).toBe(tillTotal);
  });
});

describe('markdownPerUnit', () => {
  it('never goes negative for a line priced above the catalog', () => {
    expect(markdownPerUnit({ unitPriceCents: 30000, catalogPriceCents: 25000 })).toBe(0);
  });
});

describe('overrideAllowed', () => {
  it('allows a price at or below the list price', () => {
    expect(overrideAllowed(25000, 25000)).toBe(true);
    expect(overrideAllowed(100, 25000)).toBe(true);
  });
  it('refuses zero, negative, and anything above the list price', () => {
    expect(overrideAllowed(0, 25000)).toBe(false);
    expect(overrideAllowed(-5, 25000)).toBe(false);
    expect(overrideAllowed(25001, 25000)).toBe(false);
  });
});
