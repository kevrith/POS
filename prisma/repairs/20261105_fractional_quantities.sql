-- Review and repair quantities damaged by the old INTEGER columns. RUN THIS ONLY AFTER the
-- 20261105100000_fractional_quantities migration has been applied. It changes nothing until you run the
-- UPDATE section; the SELECTs at the top show what would change.
--
-- What went wrong: a fractional sale quantity (0.5 kg) was rounded to a whole number when stored, so
--   * SaleItem.quantity is wrong, but totalCents (computed before storing) is right;
--   * the SALE / VOID / RETURN InventoryMovement rows for that sale are equally wrong.
-- What can be recovered: for an ordinary line, totalCents = unitPriceCents x quantity, so the true
-- quantity is totalCents / unitPriceCents. Lines taken from a restaurant order carry modifiers in the
-- total, so their unit price is derived from the total and the stored whole quantity is already right;
-- the tolerance below keeps those out.
--
-- Not recoverable: batch quantities and transfer / GRN / supplier-return lines, which have no second
-- number to compare against. Count those stocks and post an ADJUSTMENT.

-- 1. Sale lines whose stored quantity disagrees with their own price and total.
SELECT si."id", si."saleId", si."name", si."quantity" AS stored_qty, si."unitPriceCents", si."totalCents",
       ROUND((si."totalCents"::numeric / si."unitPriceCents"), 3) AS implied_qty
FROM "SaleItem" si
WHERE si."unitPriceCents" > 0
  AND ABS(si."totalCents" - si."unitPriceCents" * si."quantity") > GREATEST(si."quantity", 1);

-- 2. How many ledger movements would follow those lines.
SELECT m."type", COUNT(*) AS movements
FROM "InventoryMovement" m
JOIN "SaleItem" si ON si."saleId" = m."saleId" AND si."itemId" = m."itemId"
WHERE si."unitPriceCents" > 0
  AND ABS(si."totalCents" - si."unitPriceCents" * si."quantity") > GREATEST(si."quantity", 1)
  AND m."type" IN ('SALE')
GROUP BY m."type";

-- 3. THE REPAIR. Uncomment, run inside the transaction, check the row counts, then COMMIT.
-- BEGIN;
--
-- -- The ledger first, while the sale lines still show the old quantities that identify them.
-- UPDATE "InventoryMovement" m
-- SET "quantity" = -ROUND((si."totalCents"::numeric / si."unitPriceCents"), 3)
-- FROM "SaleItem" si
-- WHERE si."saleId" = m."saleId" AND si."itemId" = m."itemId"
--   AND m."type" = 'SALE'
--   AND si."unitPriceCents" > 0
--   AND ABS(si."totalCents" - si."unitPriceCents" * si."quantity") > GREATEST(si."quantity", 1);
--
-- UPDATE "SaleItem" si
-- SET "quantity" = ROUND((si."totalCents"::numeric / si."unitPriceCents"), 3)
-- WHERE si."unitPriceCents" > 0
--   AND ABS(si."totalCents" - si."unitPriceCents" * si."quantity") > GREATEST(si."quantity", 1);
--
-- COMMIT;   -- or ROLLBACK;
