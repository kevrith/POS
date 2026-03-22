-- CreateTable
CREATE TABLE IF NOT EXISTS "FuelPumpMaintenance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technicianName" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelPumpMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FuelPumpMaintenance_businessId_pumpId_idx" ON "FuelPumpMaintenance"("businessId", "pumpId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FuelPumpMaintenance_pumpId_startedAt_idx" ON "FuelPumpMaintenance"("pumpId", "startedAt");

-- AddForeignKey
ALTER TABLE "FuelPumpMaintenance" ADD CONSTRAINT "FuelPumpMaintenance_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "FuelPump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
