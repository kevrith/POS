import type { Prisma } from '@prisma/client';

/**
 * What an insurer pays for each item, when that differs from the list price. A visit or a dispense that an insurer pays part
 * of is invoiced at the insurer's price for every item that has one, and at the list price for the rest.
 */

/** The insurer's price per item id. Empty when the insurer has no tariff. */
export async function loadTariff(db: Pick<Prisma.TransactionClient, 'insurerTariff'>, businessId: string, providerId: string): Promise<Map<string, number>> {
  const rows = await db.insurerTariff.findMany({ where: { businessId, providerId }, select: { itemId: true, priceCents: true } });
  return new Map(rows.map((r) => [r.itemId, r.priceCents]));
}

export interface PricedLine { itemId: string; name: string; quantity: number; unitPriceCents: number }

/** The same lines at the insurer's prices where it has them, with the totals either way. */
export function applyTariff<T extends PricedLine>(lines: T[], tariff: Map<string, number>): { lines: Array<T & { listUnitPriceCents: number; onTariff: boolean }>; listTotalCents: number; billTotalCents: number } {
  const out = lines.map((l) => {
    const price = tariff.get(l.itemId);
    const onTariff = price !== undefined && price !== l.unitPriceCents;
    return { ...l, listUnitPriceCents: l.unitPriceCents, unitPriceCents: price ?? l.unitPriceCents, onTariff };
  });
  const total = (key: 'listUnitPriceCents' | 'unitPriceCents') => out.reduce((s, l) => s + Math.round(l[key] * l.quantity), 0);
  return { lines: out, listTotalCents: total('listUnitPriceCents'), billTotalCents: total('unitPriceCents') };
}
