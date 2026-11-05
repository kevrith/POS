-- Tax classes: exempt, standard-rated, zero-rated and non-VAT supplies are taxed and invoiced differently.
--
-- Until now the system took 16/116 of every sale and sent every line to KRA as standard-rated, whatever the item
-- was. `Item.vatApplicable` existed but nothing read it, so flour, unprocessed foods and exempt medicines were
-- charged VAT on the books and on the eTIMS invoice.
--
--   Item.taxClass       A exempt | B standard 16% | C zero-rated | D not subject to VAT   (default B)
--   SaleItem.taxClass   the class the line was SOLD under, so changing an item later never rewrites a past
--                       invoice. NULL on every existing row: those lines were all taxed as standard-rated.
--   SaleItem.vatCents / discountCents   the line's own VAT and its share of the sale discount.
--   Sale.taxClassified  true once vatCents is the sum of the lines; false on existing sales, which keep the
--                       report repair that recomputes their (historically mis-stored) VAT.
--
-- NO ITEM CHANGES CLASS HERE. Every existing item becomes standard-rated (B), which is exactly how the system has
-- always taxed it. The old `vatApplicable` flag is deliberately NOT converted: the web create form defaulted it to
-- unchecked, so most items hold `false` without anyone having chosen it, and reading that as "exempt" would
-- under-declare VAT to KRA. An owner marks flour, exempt medicines and the like in the app (Inventory > Tax class),
-- one by one or in bulk.
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "taxClass" TEXT NOT NULL DEFAULT 'B';

ALTER TABLE "SaleItem"
  ADD COLUMN IF NOT EXISTS "taxClass" TEXT,
  ADD COLUMN IF NOT EXISTS "vatCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "taxClassified" BOOLEAN NOT NULL DEFAULT false;
