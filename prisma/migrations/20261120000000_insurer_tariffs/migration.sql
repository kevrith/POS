-- What an insurer pays for an item when it differs from the list price. Safe to run again.

CREATE TABLE IF NOT EXISTS "InsurerTariff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InsurerTariff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InsurerTariff_providerId_itemId_key" ON "InsurerTariff"("providerId", "itemId");
CREATE INDEX IF NOT EXISTS "InsurerTariff_businessId_providerId_idx" ON "InsurerTariff"("businessId", "providerId");
