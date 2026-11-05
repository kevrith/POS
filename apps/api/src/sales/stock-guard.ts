import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QTY_EPSILON, roundQty } from '../common/quantity';

/** The slice of a Prisma transaction the guard needs, so it can be tested without a database. */
export type StockGuardTx = Pick<Prisma.TransactionClient, '$queryRaw' | 'inventoryMovement'>;

/**
 * Does a sale of this item have to stop at what is on the shelf? Either the item says so (the "block oversell"
 * switch in Inventory) or the business does (Settings: negative stock policy). The item's own ALLOW is the
 * default every item is saved with, so it cannot lift a business-wide BLOCK.
 */
export function blocksOversell(item: { negativeStockPolicy?: string | null }, businessPolicy?: string | null): boolean {
  return item.negativeStockPolicy === 'BLOCK' || businessPolicy === 'BLOCK';
}

export interface StockLine { itemId: string; name: string; quantity: number }

/**
 * Refuse to take more of an item than the store has, in a way two tills cannot both get past.
 *
 * Reading the stock and then writing the sale (the old check) lets two carts read the same last units, both pass,
 * and both sell them. Here the item rows are locked first (in id order, so two carts with the same items cannot
 * deadlock) and the stock is read after the lock is held, so the second cart waits for the first to commit and then
 * sees what is really left. The lock is released with the transaction.
 */
export async function assertStockAvailable(
  tx: StockGuardTx,
  a: { businessId: string; storeId: string; lines: StockLine[] },
): Promise<void> {
  const wanted = new Map<string, { name: string; quantity: number }>();
  for (const l of a.lines) {
    const prev = wanted.get(l.itemId);
    wanted.set(l.itemId, { name: l.name, quantity: roundQty((prev?.quantity ?? 0) + l.quantity) });
  }
  if (wanted.size === 0) return;

  const ids = [...wanted.keys()].sort();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Item" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`);

  for (const id of ids) {
    const need = wanted.get(id)!;
    const agg = await tx.inventoryMovement.aggregate({
      where: { itemId: id, storeId: a.storeId, businessId: a.businessId },
      _sum: { quantity: true },
    });
    const onHand = roundQty(agg._sum.quantity ?? 0);
    if (onHand + QTY_EPSILON < need.quantity) {
      throw new BadRequestException(`Insufficient stock for ${need.name}. Available: ${onHand}, needed: ${need.quantity}`);
    }
  }
}

/**
 * Can this item be sold in parts of a unit? Weighed and fractional items can; a bottle of milk cannot be sold as 1.5.
 * Services (an hour and a half of browsing) and anything outside the by-the-piece types are left alone.
 */
export function sellsInFractions(item: { type?: string | null; isFractional?: boolean | null; isWeighed?: boolean | null }): boolean {
  if (item.isFractional || item.isWeighed || item.type === 'WEIGHTED') return true;
  return !['PRODUCT', 'BUNDLE', 'RECIPE'].includes(item.type ?? 'PRODUCT');
}
