-- FuelGrade
CREATE TABLE IF NOT EXISTS "FuelGrade" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "pricePerLitreCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelGrade_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelGrade_businessId_storeId_idx" ON "FuelGrade"("businessId", "storeId");

-- FuelPump
CREATE TABLE IF NOT EXISTS "FuelPump" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "pumpNumber" INTEGER NOT NULL,
  "label" TEXT,
  "gradeId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IDLE',
  "nozzleCount" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelPump_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelPump_businessId_storeId_pumpNumber_key" UNIQUE ("businessId", "storeId", "pumpNumber"),
  CONSTRAINT "FuelPump_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "FuelGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelPump_businessId_storeId_status_idx" ON "FuelPump"("businessId", "storeId", "status");

-- FuelSale
CREATE TABLE IF NOT EXISTS "FuelSale" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "pumpId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "cashierId" TEXT,
  "customerId" TEXT,
  "vehiclePlate" TEXT,
  "litresDispensed" DOUBLE PRECISION NOT NULL,
  "pricePerLitreCents" INTEGER NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
  "paymentRef" TEXT,
  "saleId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "authorizedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelSale_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelSale_saleId_key" UNIQUE ("saleId"),
  CONSTRAINT "FuelSale_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "FuelPump"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FuelSale_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "FuelGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelSale_businessId_storeId_createdAt_idx" ON "FuelSale"("businessId", "storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "FuelSale_pumpId_idx" ON "FuelSale"("pumpId");
CREATE INDEX IF NOT EXISTS "FuelSale_status_idx" ON "FuelSale"("status");
