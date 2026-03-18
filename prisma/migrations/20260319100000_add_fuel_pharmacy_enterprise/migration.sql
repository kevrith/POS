-- FuelTank
CREATE TABLE IF NOT EXISTS "FuelTank" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "tankNumber" INTEGER NOT NULL,
  "label" TEXT,
  "gradeId" TEXT NOT NULL,
  "capacityLitres" DOUBLE PRECISION NOT NULL,
  "currentLitres" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "minLevelLitres" DOUBLE PRECISION NOT NULL DEFAULT 500,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelTank_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelTank_businessId_storeId_tankNumber_key" UNIQUE ("businessId", "storeId", "tankNumber"),
  CONSTRAINT "FuelTank_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "FuelGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelTank_businessId_storeId_idx" ON "FuelTank"("businessId", "storeId");

-- FuelTankDipping
CREATE TABLE IF NOT EXISTS "FuelTankDipping" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "tankId" TEXT NOT NULL,
  "litres" DOUBLE PRECISION NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "notes" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelTankDipping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelTankDipping_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "FuelTank"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelTankDipping_tankId_recordedAt_idx" ON "FuelTankDipping"("tankId", "recordedAt");

-- FuelDelivery
CREATE TABLE IF NOT EXISTS "FuelDelivery" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "tankId" TEXT NOT NULL,
  "litresDelivered" DOUBLE PRECISION NOT NULL,
  "supplierName" TEXT,
  "docketNumber" TEXT,
  "deliveredBy" TEXT,
  "notes" TEXT,
  "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelDelivery_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "FuelTank"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelDelivery_businessId_deliveredAt_idx" ON "FuelDelivery"("businessId", "deliveredAt");

-- FuelShift
CREATE TABLE IF NOT EXISTS "FuelShift" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cashierId" TEXT,
  "cashierName" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "notes" TEXT,
  CONSTRAINT "FuelShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelShift_businessId_storeId_status_idx" ON "FuelShift"("businessId", "storeId", "status");

-- FuelShiftReading
CREATE TABLE IF NOT EXISTS "FuelShiftReading" (
  "id" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "pumpId" TEXT NOT NULL,
  "openingLitres" DOUBLE PRECISION NOT NULL,
  "closingLitres" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FuelShiftReading_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FuelShiftReading_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FuelShift"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FuelShiftReading_shiftId_idx" ON "FuelShiftReading"("shiftId");

-- FleetAccount
CREATE TABLE IF NOT EXISTS "FleetAccount" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
  "balanceCents" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FleetAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FleetAccount_businessId_idx" ON "FleetAccount"("businessId");

-- FleetTransaction
CREATE TABLE IF NOT EXISTS "FleetTransaction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "fleetAccountId" TEXT NOT NULL,
  "fuelSaleId" TEXT,
  "type" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "description" TEXT,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FleetTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetTransaction_fleetAccountId_fkey" FOREIGN KEY ("fleetAccountId") REFERENCES "FleetAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FleetTransaction_fleetAccountId_createdAt_idx" ON "FleetTransaction"("fleetAccountId", "createdAt");

-- DrugCatalogue
CREATE TABLE IF NOT EXISTS "DrugCatalogue" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "genericName" TEXT NOT NULL,
  "brandName" TEXT,
  "strength" TEXT,
  "dosageForm" TEXT,
  "category" TEXT,
  "scheduleClass" TEXT,
  "defaultInstructions" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DrugCatalogue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DrugCatalogue_businessId_idx" ON "DrugCatalogue"("businessId");
CREATE INDEX IF NOT EXISTS "DrugCatalogue_genericName_idx" ON "DrugCatalogue"("genericName");
