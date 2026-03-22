-- CreateTable: CyberPackage (referenced by CyberSession, so create first)
CREATE TABLE IF NOT EXISTS "CyberPackage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CyberPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CyberStation
CREATE TABLE IF NOT EXISTS "CyberStation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "specs" TEXT,
    "ratePerHourCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CyberStation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CyberSession
CREATE TABLE IF NOT EXISTS "CyberSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "packageId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "pausedMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" DOUBLE PRECISION,
    "ratePerHourCents" INTEGER NOT NULL,
    "printPagesCents" INTEGER NOT NULL DEFAULT 0,
    "extrasCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentMethod" TEXT,
    "paymentRef" TEXT,
    "saleId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CyberSession_pkey" PRIMARY KEY ("id")
);

-- Unique & Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "CyberStation_businessId_storeId_number_key" ON "CyberStation"("businessId", "storeId", "number");
CREATE INDEX IF NOT EXISTS "CyberStation_businessId_storeId_status_idx" ON "CyberStation"("businessId", "storeId", "status");
CREATE INDEX IF NOT EXISTS "CyberSession_businessId_storeId_status_idx" ON "CyberSession"("businessId", "storeId", "status");
CREATE INDEX IF NOT EXISTS "CyberSession_stationId_status_idx" ON "CyberSession"("stationId", "status");
CREATE INDEX IF NOT EXISTS "CyberSession_businessId_createdAt_idx" ON "CyberSession"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "CyberPackage_businessId_idx" ON "CyberPackage"("businessId");

-- Foreign Keys
ALTER TABLE "CyberSession" ADD CONSTRAINT "CyberSession_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "CyberStation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CyberSession" ADD CONSTRAINT "CyberSession_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "CyberPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
