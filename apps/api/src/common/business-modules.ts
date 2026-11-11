import { moduleIncludedByMode, OPTIONAL_MODULES, parseEnabledModules, type OptionalModule } from '@pos/shared';

/** The part of PrismaService this needs, so it can be tested without a database. */
interface ModulesDb {
  business: {
    findUnique(args: { where: { id: string }; select: { posMode: true; enabledModules: true } }): Promise<{ posMode: string; enabledModules: string } | null>;
    updateMany(args: { where: { id: string; enabledModules: string }; data: { enabledModules: string } }): Promise<{ count: number }>;
  };
}

/**
 * Switch an optional module on for a business the first time it actually uses the feature.
 *
 * Delivery, field sales and quotes are hidden from the menu of businesses whose main till does not use them (a salon, a
 * table-service restaurant). Hiding them is only safe if a business that DOES use one is never left without the menu entry:
 * an online order placed on a restaurant's store, a field order an agent sends in, a quote someone writes. Those places call
 * this, so the entry appears at once and nobody has to find a Settings switch for something that is already happening.
 *
 * Does nothing when the main till already includes the module or it is already on. Never throws: the order or quote that
 * triggered it must not fail because a menu flag could not be written.
 */
export async function enableBusinessModule(db: ModulesDb, businessId: string, module: OptionalModule): Promise<boolean> {
  if (!businessId || !(OPTIONAL_MODULES as readonly string[]).includes(module)) return false;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await db.business.findUnique({ where: { id: businessId }, select: { posMode: true, enabledModules: true } });
      if (!row) return false;
      const on = parseEnabledModules(row.enabledModules);
      if (moduleIncludedByMode(module, row.posMode) || on.includes(module)) return false;
      // Compare-and-set on the stored text, so a change made at the same moment (the owner saving Settings) is not overwritten.
      const done = await db.business.updateMany({
        where: { id: businessId, enabledModules: row.enabledModules },
        data: { enabledModules: JSON.stringify([...on, module]) },
      });
      if (done.count === 1) return true;
    }
  } catch {
    /* a menu flag is never worth failing the real work */
  }
  return false;
}
