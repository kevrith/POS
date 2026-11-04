-- Print job queue and audit trail. No foreign keys: history outlives printers and sales.
CREATE TABLE IF NOT EXISTS "PrintJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "printerId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "method" TEXT NOT NULL DEFAULT 'BRIDGE',
    "payload" TEXT,
    "payloadBytes" INTEGER NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "refNumber" TEXT,
    "copyNumber" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdById" TEXT,
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PrintJob_businessId_storeId_status_idx" ON "PrintJob"("businessId", "storeId", "status");
CREATE INDEX IF NOT EXISTS "PrintJob_saleId_kind_idx" ON "PrintJob"("saleId", "kind");
CREATE INDEX IF NOT EXISTS "PrintJob_printerId_idx" ON "PrintJob"("printerId");
