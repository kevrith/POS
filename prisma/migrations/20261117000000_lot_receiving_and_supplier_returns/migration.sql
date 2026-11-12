-- Returns to a supplier now remember the store the stock left and the lot it came from, so cancelling a return puts the
-- units back where they were. New returns start SENT (the goods have left). Safe to run again.

ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "SupplierReturn" ALTER COLUMN "status" SET DEFAULT 'SENT';
ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "batchId" TEXT;
ALTER TABLE "SupplierReturnItem" ADD COLUMN IF NOT EXISTS "lotNumber" TEXT;
