import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { InventoryMovementType } from '@pos/shared';
import { QTY_EPSILON, roundQty } from '../common/quantity';

/**
 * Taking stock out of, and putting it back into, batches.
 *
 * The stock ledger (InventoryMovement) says how much of an item there is; batches say which lot it
 * came from and when it expires. They have to move together. Selling used to touch only the ledger,
 * so a batch's `quantityRemaining` never fell, and the nightly expiry job then wrote off every unit the
 * batch was received with, including the ones already sold: negative stock and a fake shrinkage loss.
 *
 * Everything here takes a transaction client so the batch change and the movement commit with the sale.
 */
export type BatchTx = Pick<Prisma.TransactionClient, 'batch' | 'inventoryMovement'>;

export interface BatchSlice { batchId: string; quantity: number }

const CLAIM_ATTEMPTS = 3;

async function claimFromBatch(tx: BatchTx, batch: { id: string; quantityRemaining: number }, want: number): Promise<number> {
  let available = batch.quantityRemaining;
  for (let i = 0; i < CLAIM_ATTEMPTS; i++) {
    const take = roundQty(Math.min(want, available));
    if (take <= 0) return 0;
    // Conditional on what is still there, so two sales at once cannot both take the same units.
    const done = await tx.batch.updateMany({
      where: { id: batch.id, status: 'ACTIVE', quantityRemaining: { gte: take } },
      data: { quantityRemaining: { decrement: take } },
    });
    if (done.count === 1) return take;
    const fresh = await tx.batch.findFirst({ where: { id: batch.id, status: 'ACTIVE' }, select: { quantityRemaining: true } });
    available = fresh?.quantityRemaining ?? 0;
  }
  return 0;
}

async function movement(
  tx: BatchTx,
  a: { businessId: string; storeId: string; itemId: string; saleId?: string; type: string; source: string },
  quantity: number,
  batchId?: string,
) {
  await tx.inventoryMovement.create({
    data: {
      offlineId: uuidv4(),
      businessId: a.businessId,
      storeId: a.storeId,
      itemId: a.itemId,
      type: a.type,
      quantity,
      saleId: a.saleId,
      batchId,
      source: a.source,
    },
  });
}

/**
 * Take `quantity` of an item out of stock, first-expiry-first-out when the item tracks batches.
 *
 * - Expired batches are never drawn from. If the sale needs more than the in-date batches (and any stock that
 *   was never put in a batch) can cover, and expired units are what is left, it is refused rather than
 *   quietly selling them.
 * - Whatever batches cannot cover is taken as an unbatched movement, so stock received without batch records
 *   still sells, and the negative-stock policy stays the caller's business.
 * - An item that does not track batches gets exactly one movement, as before.
 */
export async function drawStock(
  tx: BatchTx,
  a: {
    businessId: string;
    storeId: string;
    itemId: string;
    itemName?: string;
    quantity: number;
    saleId?: string;
    trackBatches: boolean;
    type?: string;
    source?: string;
    now?: Date;
  },
): Promise<{ slices: BatchSlice[]; unbatched: number }> {
  const qty = roundQty(a.quantity);
  if (!(qty > 0)) return { slices: [], unbatched: 0 };
  const base = { businessId: a.businessId, storeId: a.storeId, itemId: a.itemId, saleId: a.saleId, type: a.type ?? InventoryMovementType.SALE, source: a.source ?? 'POS' };

  const slices: BatchSlice[] = [];
  let remaining = qty;

  if (a.trackBatches) {
    const now = a.now ?? new Date();
    // Soonest expiry first; a batch with no expiry date sorts last.
    const live = await tx.batch.findMany({
      where: { itemId: a.itemId, storeId: a.storeId, status: 'ACTIVE', quantityRemaining: { gt: QTY_EPSILON }, item: { businessId: a.businessId } },
      orderBy: { expiryDate: 'asc' },
    });
    const inDate = live.filter((b) => !b.expiryDate || b.expiryDate >= now);
    const expired = live.filter((b) => b.expiryDate && b.expiryDate < now);

    for (const b of inDate) {
      if (remaining <= 0) break;
      const taken = await claimFromBatch(tx, b, remaining);
      if (taken > 0) {
        slices.push({ batchId: b.id, quantity: taken });
        remaining = roundQty(remaining - taken);
      }
    }

    if (remaining > 0 && expired.length > 0) {
      // Is the rest really stock that was never batched, or is it the expired units on the shelf?
      const expiredUnits = roundQty(expired.reduce((s, b) => s + b.quantityRemaining, 0));
      const batchedUnits = roundQty(live.reduce((s, b) => s + b.quantityRemaining, 0));
      const onHand = await onHandQty(tx, a.itemId, a.storeId, a.businessId);
      const unbatched = Math.max(0, roundQty(onHand - batchedUnits));
      if (remaining > unbatched + QTY_EPSILON) {
        throw new BadRequestException(
          `${a.itemName ?? 'This item'}: only expired stock is left (${expiredUnits} past its date). Write it off before selling.`,
        );
      }
    }
  }

  for (const s of slices) await movement(tx, base, -s.quantity, s.batchId);
  if (remaining > 0) await movement(tx, base, -remaining);
  return { slices, unbatched: remaining };
}

/**
 * Put sold stock back (a void or a return). Units go to the batches the sale took them from, newest draw
 * first, so the lot's remaining count and expiry picture stay right. A batch that has since been written
 * off or recalled does not take them back; those units return as unbatched stock.
 */
export async function restoreStock(
  tx: BatchTx,
  a: {
    businessId: string;
    storeId: string;
    itemId: string;
    quantity: number;
    saleId: string;
    type: string;
    source?: string;
  },
): Promise<{ slices: BatchSlice[]; unbatched: number }> {
  const qty = roundQty(a.quantity);
  if (!(qty > 0)) return { slices: [], unbatched: 0 };
  const base = { businessId: a.businessId, storeId: a.storeId, itemId: a.itemId, saleId: a.saleId, type: a.type, source: a.source ?? 'POS' };

  // What this sale still has out of each batch: every movement against the sale and item, signed.
  const rows = await tx.inventoryMovement.findMany({
    where: { saleId: a.saleId, itemId: a.itemId, batchId: { not: null } },
    select: { batchId: true, quantity: true },
    orderBy: { createdAt: 'desc' },
  });
  const outstanding = new Map<string, number>();
  for (const r of rows) outstanding.set(r.batchId as string, roundQty((outstanding.get(r.batchId as string) ?? 0) - r.quantity));

  const slices: BatchSlice[] = [];
  let remaining = qty;
  for (const [batchId, out] of outstanding) {
    if (remaining <= 0) break;
    const give = roundQty(Math.min(remaining, out));
    if (give <= 0) continue;
    const back = await tx.batch.updateMany({
      where: { id: batchId, status: { notIn: ['WRITTEN_OFF', 'RECALLED'] } },
      data: { quantityRemaining: { increment: give } },
    });
    if (back.count !== 1) continue;
    slices.push({ batchId, quantity: give });
    remaining = roundQty(remaining - give);
  }

  for (const s of slices) await movement(tx, base, s.quantity, s.batchId);
  if (remaining > 0) await movement(tx, base, remaining);
  return { slices, unbatched: remaining };
}

async function onHandQty(tx: BatchTx, itemId: string, storeId: string, businessId: string): Promise<number> {
  const agg = await tx.inventoryMovement.aggregate({ where: { itemId, storeId, businessId }, _sum: { quantity: true } });
  return roundQty(agg._sum.quantity ?? 0);
}
