-- How a business handles kitchen tickets: KDS (display) or PRINT_ONLY (printed and carried).
-- Written to be safe to run again: if an earlier attempt applied only part of it (a lock timeout on a busy database), a
-- re-run completes it instead of failing on something that already exists.
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "kitchenMode" TEXT NOT NULL DEFAULT 'KDS';

-- Permanent void log for table orders.
CREATE TABLE IF NOT EXISTS "OrderVoid" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "scope" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCents" INTEGER NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "note" TEXT,
    "wasSent" BOOLEAN NOT NULL,
    "wasPrepared" BOOLEAN NOT NULL DEFAULT false,
    "voidedById" TEXT NOT NULL,
    "voidedByName" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderVoid_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderVoid_businessId_storeId_createdAt_idx" ON "OrderVoid"("businessId", "storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrderVoid_orderId_idx" ON "OrderVoid"("orderId");
