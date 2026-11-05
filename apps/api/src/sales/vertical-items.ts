import { v4 as uuidv4 } from 'uuid';

/**
 * The catalogue item a vertical's invoice line is sold as. eTIMS needs an item and a tax class on every line, but a
 * session's time or an appointment is not something a till should ring up, so these are made on first use, inactive
 * (no till lists them), under a category named for the vertical. They start standard-rated (class B); the owner
 * classifies them in Inventory like any other item, and the class they hold is what the next invoice uses.
 */
export async function ensureServiceItem(
  tx: any,
  a: { businessId: string; storeId: string; category: string; name: string },
): Promise<{ id: string; taxClass: string | null; vatApplicable: boolean }> {
  const found = await tx.item.findFirst({ where: { businessId: a.businessId, storeId: a.storeId, category: a.category, name: a.name } });
  if (found) return found;
  return tx.item.create({
    data: {
      offlineId: uuidv4(),
      businessId: a.businessId,
      storeId: a.storeId,
      name: a.name,
      category: a.category,
      type: 'SERVICE',
      retailPriceCents: 0,
      trackStock: false,
      isActive: false,
      taxClass: 'B',
      vatApplicable: true,
    },
  });
}
