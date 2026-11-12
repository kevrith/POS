import { BadRequestException } from '@nestjs/common';
import { QTY_EPSILON, hasTooManyDecimals, roundQty } from '../common/quantity';

/**
 * Checking a delivery before it becomes stock. Free of the database so the rules can be tested alone.
 *
 * A goods received note says what actually arrived. It must name things the purchase order asked for, never take in more
 * than is still outstanding, and for stock that is tracked by lot it must say which lot and (for medicines) when it expires,
 * because that is the only moment anyone knows.
 */

export interface PoItemLike { id: string; itemId: string; quantityOrdered: number }
export interface ReceivedBefore { poItemId: string; quantityReceived: number }
export interface ItemFacts { id: string; name: string; trackBatches: boolean; isMedicine: boolean }
export interface LineIn { poItemId?: unknown; quantityReceived?: unknown; batchLotNumber?: unknown; expiryDate?: unknown }

export interface PlannedLine {
  poItemId: string; itemId: string; itemName: string; quantity: number;
  trackBatches: boolean; lot: string | null; expiry: Date | null;
}

const MAX_LINES = 200;

/** A date the way the screen sends it (2027-03-31) or as a full timestamp, or null when it is not a real date. */
export function parseExpiry(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const v = value.trim();
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) && d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

export function planReceipt(po: PoItemLike[], before: ReceivedBefore[], lines: LineIn[], items: Map<string, ItemFacts>, now = new Date()): PlannedLine[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new BadRequestException('Say what was received');
  if (lines.length > MAX_LINES) throw new BadRequestException(`At most ${MAX_LINES} lines on one receipt`);
  const byId = new Map(po.map((p) => [p.id, p]));
  const planned: PlannedLine[] = [];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  for (const line of lines) {
    const poItem = typeof line?.poItemId === 'string' ? byId.get(line.poItemId) : undefined;
    if (!poItem) throw new BadRequestException('A line is not on this purchase order');
    const qty = typeof line.quantityReceived === 'number' ? line.quantityReceived : Number(line.quantityReceived);
    if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000_000) throw new BadRequestException('Quantities received must be numbers, zero or more');
    if (hasTooManyDecimals(qty)) throw new BadRequestException('Quantities can have at most 3 decimal places');
    if (qty === 0) continue; // nothing arrived on this line
    const facts = items.get(poItem.itemId);
    if (!facts) throw new BadRequestException('An item on this order is no longer in the catalogue');

    let lot: string | null = null;
    let expiry: Date | null = null;
    if (facts.trackBatches) {
      lot = typeof line.batchLotNumber === 'string' ? line.batchLotNumber.trim() : '';
      if (!lot) throw new BadRequestException(`${facts.name}: enter the lot (batch) number from the pack`);
      if (lot.length > 60) throw new BadRequestException(`${facts.name}: the lot number is too long`);
      const given = line.expiryDate !== undefined && line.expiryDate !== null && line.expiryDate !== '';
      expiry = parseExpiry(line.expiryDate);
      if (given && !expiry) throw new BadRequestException(`${facts.name}: the expiry date is not a real date`);
      if (!expiry && facts.isMedicine) throw new BadRequestException(`${facts.name}: enter the expiry date from the pack`);
      if (expiry && expiry < today) throw new BadRequestException(`${facts.name}: lot ${lot} has already expired (${expiry.toISOString().slice(0, 10)}). Do not receive it: send it back.`);
    }
    planned.push({ poItemId: poItem.id, itemId: poItem.itemId, itemName: facts.name, quantity: roundQty(qty), trackBatches: facts.trackBatches, lot, expiry });
  }
  if (planned.length === 0) throw new BadRequestException('Nothing was received: enter a quantity on at least one line');

  // Never more than what is still outstanding on each line of the order.
  const received = new Map<string, number>();
  for (const b of before) received.set(b.poItemId, (received.get(b.poItemId) ?? 0) + b.quantityReceived);
  const now_ = new Map<string, number>();
  for (const p of planned) now_.set(p.poItemId, (now_.get(p.poItemId) ?? 0) + p.quantity);
  for (const [poItemId, qty] of now_) {
    const poItem = byId.get(poItemId) as PoItemLike;
    const outstanding = roundQty(poItem.quantityOrdered - (received.get(poItemId) ?? 0));
    if (qty > outstanding + QTY_EPSILON) {
      const name = planned.find((p) => p.poItemId === poItemId)?.itemName ?? 'An item';
      throw new BadRequestException(`${name}: ${poItem.quantityOrdered} ordered, ${roundQty(received.get(poItemId) ?? 0)} already received, so at most ${Math.max(0, outstanding)} more can be received. Change the order first if the supplier sent extra.`);
    }
  }
  return planned;
}
