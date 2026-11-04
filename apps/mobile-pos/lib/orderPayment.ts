/**
 * Paying a dine-in table from the phone.
 *
 * The payment screen is built around the cart. A table is not a cart: its bill is
 * the order the waiters built, with its own prices and priced extras, and the
 * server builds the sale from that order and closes it in the same step. So when
 * the screen is opened for an order it stops using the cart (and the cart's
 * customer and promotion) and uses the helpers here instead.
 *
 * Pure module, no React, so it unit-tests in plain Node.
 */

export interface PayableOrderLine {
  id: string;
  name: string;
  quantity: number;
  /** The server's line total: price plus any priced modifiers, times quantity. */
  totalCents: number;
}

export interface PayableOrder {
  id: string;
  status: string;
  table?: { number: string } | null;
  items: PayableOrderLine[];
}

export interface BillLine {
  id: string;
  name: string;
  quantity: number;
  totalCents: number;
}

/** The statuses an order can still be paid in. Mirrors the server's checkout rule. */
const PAYABLE_STATUSES = ['OPEN', 'BILL_REQUESTED'];

/** `reason` is empty when the order can be paid. (A plain shape: this app is not compiled with strict null checks, so a tagged union would not narrow.) */
export interface Payable { ok: boolean; reason: string }

/** Whether this order can be paid now, and if not, what to tell the waiter. */
export function orderPayable(order: PayableOrder | null | undefined): Payable {
  if (!order) return { ok: false, reason: 'This order could not be loaded.' };
  if (!PAYABLE_STATUSES.includes(order.status)) {
    return { ok: false, reason: 'This order has already been paid or cancelled.' };
  }
  if (order.items.length === 0) return { ok: false, reason: 'There is nothing on this order to pay for.' };
  return { ok: true, reason: '' };
}

/** The lines of the bill and their sum, straight from the order. */
export function billFromOrder(order: PayableOrder | null | undefined): { lines: BillLine[]; subtotalCents: number } {
  const lines = (order?.items ?? []).map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, totalCents: l.totalCents }));
  return { lines, subtotalCents: lines.reduce((sum, l) => sum + l.totalCents, 0) };
}

/** A unit price for a receipt line. A line total is price-plus-extras times quantity, so this divides evenly. */
export function unitPriceOf(line: BillLine): number {
  return line.quantity > 0 ? Math.round(line.totalCents / line.quantity) : line.totalCents;
}

export interface OrderCheckoutInput {
  offlineId: string;
  businessId: string;
  storeId: string;
  cashierId: string;
  orderId: string;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
  discountCents?: number;
  serviceChargeCents: number;
  /** The total shown to the payer; the server refuses the sale if the bill has since changed. */
  expectedTotalCents: number;
}

/**
 * The /sales/checkout body for an order. The cart is deliberately empty: the server
 * ignores it for an order, and sending lines would only suggest the client sets the bill.
 */
export function buildOrderCheckout(input: OrderCheckoutInput) {
  return {
    offlineId: input.offlineId,
    businessId: input.businessId,
    storeId: input.storeId,
    cashierId: input.cashierId,
    type: 'NORMAL' as const,
    priceLevel: 'RETAIL' as const,
    orderId: input.orderId,
    items: [] as Array<{ itemId: string; quantity: number }>,
    payments: input.payments,
    ...(input.discountCents && input.discountCents > 0 ? { discountCents: input.discountCents } : {}),
    serviceChargeCents: input.serviceChargeCents,
    expectedTotalCents: input.expectedTotalCents,
  };
}

/** Where to go once a table is paid (or abandoned): back to the floor, not to a blank cart. */
export const AFTER_ORDER_PAYMENT_ROUTE = '/manage-tables';

/** The payment methods a table can use. Credit needs a customer account, which a table does not have. */
export function methodsForOrder<T extends { key: string }>(methods: T[]): T[] {
  return methods.filter((m) => m.key !== 'CREDIT');
}
