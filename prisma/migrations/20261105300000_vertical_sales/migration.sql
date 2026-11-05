-- One revenue pipeline: fuel (and, in later steps, hotel, pharmacy, cyber and appointment) takings become real
-- Sales, so they reach the receipt, eTIMS, Z-report, cash drawer, ledger and reports.
--
--   Business.verticalSalesFrom   the cutover. NULL = off (every existing business), so a shop that already rings
--                                these takings through the till is not counted twice. Set when an owner turns the
--                                switch on; new businesses are created with it on. No history is back-filled.
--   Sale.buyerKraPin             buyer PIN for a buyer who is not a Customer record (a fleet company).
--   FleetAccount.kraPin          the fleet company's PIN, printed as the buyer on its invoices.
--   FuelGrade.itemId             the catalogue item the grade is invoiced as (eTIMS needs an item, a class and a
--                                name per line). Made on the first sale after cutover; NULL until then.
--
-- No existing row changes.
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.

ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "verticalSalesFrom" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "buyerKraPin" TEXT;
ALTER TABLE "FleetAccount" ADD COLUMN IF NOT EXISTS "kraPin" TEXT;
ALTER TABLE "FuelGrade" ADD COLUMN IF NOT EXISTS "itemId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelGrade_itemId_fkey') THEN
    ALTER TABLE "FuelGrade" ADD CONSTRAINT "FuelGrade_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
