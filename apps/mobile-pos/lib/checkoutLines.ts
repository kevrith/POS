import type { CartItem } from '../stores/cart';

/**
 * What the till sends for the cart lines of a counter sale.
 *
 * The server prices every line from the catalog and ignores a unit price or a
 * discount percent sent with it (a phone must not be able to name its own price).
 * A per-item discount or a lowered price therefore has to travel as part of the
 * sale-level discount, exactly as the web till does it. Sending the reduced unit
 * price alone made the server total the full price, so the payments the cashier
 * collected "did not cover the total" and the sale was refused.
 */
export function toCheckoutLines(items: CartItem[]): {
  lines: Array<{ itemId: string; quantity: number }>;
  /** Total the cart lines were marked down by, to add to the sale discount. */
  lineDiscountCents: number;
} {
  return {
    lines: items.map((i) => ({ itemId: i.id, quantity: i.quantity })),
    lineDiscountCents: items.reduce((sum, i) => sum + markdownPerUnit(i) * i.quantity, 0),
  };
}

/** How far a line sits below its catalog price; never negative (a price cannot be raised). */
export function markdownPerUnit(item: Pick<CartItem, 'unitPriceCents' | 'catalogPriceCents'>): number {
  return Math.max(0, item.catalogPriceCents - item.unitPriceCents);
}

/** A price typed over the list price cannot be honoured: the server would charge the list price. */
export function overrideAllowed(newPriceCents: number, catalogPriceCents: number): boolean {
  return newPriceCents > 0 && newPriceCents <= catalogPriceCents;
}
