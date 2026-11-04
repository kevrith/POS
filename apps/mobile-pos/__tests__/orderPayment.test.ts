import {
  orderPayable, billFromOrder, unitPriceOf, buildOrderCheckout, methodsForOrder, AFTER_ORDER_PAYMENT_ROUTE,
  type PayableOrder,
} from '../lib/orderPayment';

const order = (over: Partial<PayableOrder> = {}): PayableOrder => ({
  id: 'o1', status: 'BILL_REQUESTED', table: { number: '5' },
  items: [
    { id: 'l1', name: 'Pilau', quantity: 2, totalCents: 80_000 },   // KES 350 + KES 50 extra, two plates
    { id: 'l2', name: 'Soda', quantity: 1, totalCents: 10_000 },
  ],
  ...over,
});

describe('orderPayable', () => {
  it('allows an open order and one whose bill was requested', () => {
    expect(orderPayable(order({ status: 'OPEN' })).ok).toBe(true);
    expect(orderPayable(order()).ok).toBe(true);
  });

  it('refuses a paid or cancelled order, with a reason to show', () => {
    for (const status of ['PAID', 'CANCELLED', 'CLOSED']) {
      const r = orderPayable(order({ status }));
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/already been paid or cancelled/);
    }
  });

  it('refuses an empty order and a missing one', () => {
    expect(orderPayable(order({ items: [] })).ok).toBe(false);
    expect(orderPayable(undefined).ok).toBe(false);
    expect(orderPayable(null).reason).toMatch(/could not be loaded/);
  });
});

describe('billFromOrder', () => {
  it('sums the server\'s line totals, so priced extras are in the bill', () => {
    const bill = billFromOrder(order());
    expect(bill.subtotalCents).toBe(90_000);
    expect(bill.lines.map((l) => l.name)).toEqual(['Pilau', 'Soda']);
  });

  it('is an empty bill before the order has loaded', () => {
    expect(billFromOrder(undefined)).toEqual({ lines: [], subtotalCents: 0 });
  });

  it('derives a receipt unit price from the line total', () => {
    expect(unitPriceOf({ id: 'l1', name: 'Pilau', quantity: 2, totalCents: 80_000 })).toBe(40_000);
    expect(unitPriceOf({ id: 'x', name: 'x', quantity: 0, totalCents: 500 })).toBe(500);
  });
});

describe('buildOrderCheckout', () => {
  const base = {
    offlineId: 'off-1', businessId: 'b', storeId: 's', cashierId: 'u', orderId: 'o1',
    payments: [{ method: 'CASH', amountCents: 90_000 }],
    serviceChargeCents: 0, expectedTotalCents: 90_000,
  };

  it('names the order, sends no cart lines, and states the total the payer was shown', () => {
    const body = buildOrderCheckout(base);
    expect(body.orderId).toBe('o1');
    expect(body.items).toEqual([]);
    expect(body.expectedTotalCents).toBe(90_000);
    expect(body.type).toBe('NORMAL');
  });

  it('always sends the service charge explicitly, so the server does not apply its own default on top', () => {
    expect(buildOrderCheckout(base)).toHaveProperty('serviceChargeCents', 0);
  });

  it('leaves a zero or missing discount out', () => {
    expect(buildOrderCheckout(base)).not.toHaveProperty('discountCents');
    expect(buildOrderCheckout({ ...base, discountCents: 0 })).not.toHaveProperty('discountCents');
    expect(buildOrderCheckout({ ...base, discountCents: 5_000 }).discountCents).toBe(5_000);
  });
});

describe('table payment rules', () => {
  it('takes credit off the menu of methods, since a table has no customer account', () => {
    const methods = [{ key: 'CASH' }, { key: 'CREDIT' }, { key: 'CARD' }];
    expect(methodsForOrder(methods).map((m) => m.key)).toEqual(['CASH', 'CARD']);
  });

  it('returns to the floor afterwards, not to a blank cart', () => {
    expect(AFTER_ORDER_PAYMENT_ROUTE).toBe('/manage-tables');
  });
});
