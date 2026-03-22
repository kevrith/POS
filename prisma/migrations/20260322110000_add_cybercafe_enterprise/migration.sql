ALTER TABLE "CyberStation" ADD COLUMN IF NOT EXISTS "stationType" TEXT NOT NULL DEFAULT 'BROWSING';
ALTER TABLE "CyberSession" ADD COLUMN IF NOT EXISTS "extendedMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CyberSession" ADD COLUMN IF NOT EXISTS "timeLimitMinutes" INTEGER;

CREATE TABLE IF NOT EXISTS "CyberRate" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "businessId"  TEXT NOT NULL,
  "storeId"     TEXT NOT NULL,
  "service"     TEXT NOT NULL,
  "unit"        TEXT NOT NULL DEFAULT 'per page',
  "rateCents"   INTEGER NOT NULL DEFAULT 0,
  "category"    TEXT NOT NULL DEFAULT 'PRINT',
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CyberRate_businessId_storeId_idx" ON "CyberRate"("businessId", "storeId");
