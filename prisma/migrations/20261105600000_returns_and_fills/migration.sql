-- Taking a sale back for the verticals: a prescription fill and a pump sale can now be voided.
--
--   PrescriptionFill   one row per fill invoiced as a sale (after the sales-pipeline cutover); voiding the sale
--                      puts the prescription's fill count and dates back through it.
--   FuelSale.tankId    the tank the litres were drawn from, so a void returns them to it.
--   FuelSale.void*     who voided the pump sale, when and why.
--
-- No existing row changes.
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.

ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "tankId" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "voidedBy" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;

CREATE TABLE IF NOT EXISTS "PrescriptionFill" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prevLastFillDate" TIMESTAMP(3),
    "prevNextFillDate" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionFill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrescriptionFill_saleId_key" ON "PrescriptionFill"("saleId");
CREATE INDEX IF NOT EXISTS "PrescriptionFill_businessId_prescriptionId_idx" ON "PrescriptionFill"("businessId", "prescriptionId");
