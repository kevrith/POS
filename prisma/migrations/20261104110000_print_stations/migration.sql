-- Print stations: tills that deliver queued print jobs. Only a hash of the station token is stored.
CREATE TABLE IF NOT EXISTS "PrintStation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintStation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PrintStation_tokenHash_key" ON "PrintStation"("tokenHash");
CREATE INDEX IF NOT EXISTS "PrintStation_businessId_storeId_idx" ON "PrintStation"("businessId", "storeId");
