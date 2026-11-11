-- Forecourt controls for a fuel station: nozzles with their own meters, attendants who answer for pumps, tank
-- readings that keep the book-versus-measured difference, delivery cost, pump tests and a price history.
--
--   FuelNozzle           pump > nozzle > tank: one hose = one grade, one tank, one meter (totalizer).
--   FuelShiftAttendant   who is on which pumps in a shift, and the cash they declare against what the books expect.
--   FuelPumpTest         litres drawn to test a pump and poured back: moves the meter, is not a sale.
--   FuelPriceChange      every pump price change, who made it and when.
--   FuelSale             + nozzle, shift, attendant and the unit cost at the time (for margin).
--   FuelTankDipping      + the book level at the reading, measured minus book, water, and what kind of reading.
--   FuelDelivery         + docket litres, short litres, dips before/after, cost, vehicle.
--   FuelTank             + average cost per litre.
--   FuelGrade            + the regulator's price cap.
--   FuelShift/Reading    + who closed it and the reconciliation kept at close.
--
-- Every existing pump gets one nozzle per `nozzleCount`, on the pump's grade and the grade's first tank. No sale, tank
-- level or shift reading changes. Meters start unverified (lastReadingAt is null), so the first shift sets them and
-- is not flagged as a gap.
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.

ALTER TABLE "FuelGrade" ADD COLUMN IF NOT EXISTS "maxPricePerLitreCents" INTEGER;

ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "nozzleId" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "attendantId" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "attendantName" TEXT;
ALTER TABLE "FuelSale" ADD COLUMN IF NOT EXISTS "unitCostCents" INTEGER;
CREATE INDEX IF NOT EXISTS "FuelSale_shiftId_idx" ON "FuelSale"("shiftId");
CREATE INDEX IF NOT EXISTS "FuelSale_nozzleId_idx" ON "FuelSale"("nozzleId");

ALTER TABLE "FuelTank" ADD COLUMN IF NOT EXISTS "avgCostCents" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "FuelTankDipping" ADD COLUMN IF NOT EXISTS "bookLitres" DOUBLE PRECISION;
ALTER TABLE "FuelTankDipping" ADD COLUMN IF NOT EXISTS "varianceLitres" DOUBLE PRECISION;
ALTER TABLE "FuelTankDipping" ADD COLUMN IF NOT EXISTS "waterMm" DOUBLE PRECISION;
ALTER TABLE "FuelTankDipping" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'DIP';

ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "docketLitres" DOUBLE PRECISION;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "shortLitres" DOUBLE PRECISION;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "dipBeforeLitres" DOUBLE PRECISION;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "dipAfterLitres" DOUBLE PRECISION;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "unitCostCents" INTEGER;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "totalCostCents" INTEGER;
ALTER TABLE "FuelDelivery" ADD COLUMN IF NOT EXISTS "vehiclePlate" TEXT;

ALTER TABLE "FuelShift" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "FuelShift" ADD COLUMN IF NOT EXISTS "closeNotes" TEXT;

ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "nozzleId" TEXT;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "attendantId" TEXT;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "previousClosingLitres" DOUBLE PRECISION;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "openingNote" TEXT;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "meterLitres" DOUBLE PRECISION;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "soldLitres" DOUBLE PRECISION;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "testLitres" DOUBLE PRECISION;
ALTER TABLE "FuelShiftReading" ADD COLUMN IF NOT EXISTS "unrecordedLitres" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "FuelShiftReading_nozzleId_idx" ON "FuelShiftReading"("nozzleId");

CREATE TABLE IF NOT EXISTS "FuelNozzle" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "nozzleNumber" INTEGER NOT NULL,
    "gradeId" TEXT NOT NULL,
    "tankId" TEXT,
    "totalizerLitres" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastReadingAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelNozzle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FuelNozzle_pumpId_nozzleNumber_key" ON "FuelNozzle"("pumpId", "nozzleNumber");
CREATE INDEX IF NOT EXISTS "FuelNozzle_businessId_storeId_idx" ON "FuelNozzle"("businessId", "storeId");
CREATE INDEX IF NOT EXISTS "FuelNozzle_tankId_idx" ON "FuelNozzle"("tankId");

CREATE TABLE IF NOT EXISTS "FuelShiftAttendant" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "nozzleIds" TEXT[],
    "expectedCashCents" INTEGER,
    "declaredCashCents" INTEGER,
    "cashVarianceCents" INTEGER,
    "declaredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelShiftAttendant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelShiftAttendant_shiftId_idx" ON "FuelShiftAttendant"("shiftId");

CREATE TABLE IF NOT EXISTS "FuelPumpTest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nozzleId" TEXT NOT NULL,
    "shiftId" TEXT,
    "litres" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'ROUTINE',
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelPumpTest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelPumpTest_businessId_storeId_createdAt_idx" ON "FuelPumpTest"("businessId", "storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "FuelPumpTest_shiftId_idx" ON "FuelPumpTest"("shiftId");
CREATE INDEX IF NOT EXISTS "FuelPumpTest_nozzleId_idx" ON "FuelPumpTest"("nozzleId");

CREATE TABLE IF NOT EXISTS "FuelPriceChange" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "oldPriceCents" INTEGER NOT NULL,
    "newPriceCents" INTEGER NOT NULL,
    "changedBy" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelPriceChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FuelPriceChange_gradeId_createdAt_idx" ON "FuelPriceChange"("gradeId", "createdAt");
CREATE INDEX IF NOT EXISTS "FuelPriceChange_businessId_createdAt_idx" ON "FuelPriceChange"("businessId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelNozzle_pumpId_fkey') THEN
    ALTER TABLE "FuelNozzle" ADD CONSTRAINT "FuelNozzle_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "FuelPump"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelNozzle_gradeId_fkey') THEN
    ALTER TABLE "FuelNozzle" ADD CONSTRAINT "FuelNozzle_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "FuelGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelNozzle_tankId_fkey') THEN
    ALTER TABLE "FuelNozzle" ADD CONSTRAINT "FuelNozzle_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "FuelTank"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelShiftAttendant_shiftId_fkey') THEN
    ALTER TABLE "FuelShiftAttendant" ADD CONSTRAINT "FuelShiftAttendant_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "FuelShift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelPumpTest_nozzleId_fkey') THEN
    ALTER TABLE "FuelPumpTest" ADD CONSTRAINT "FuelPumpTest_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "FuelNozzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FuelPriceChange_gradeId_fkey') THEN
    ALTER TABLE "FuelPriceChange" ADD CONSTRAINT "FuelPriceChange_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "FuelGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- One nozzle per hose the pump was set up with, on the pump's grade and the first tank of that grade in the store.
INSERT INTO "FuelNozzle" ("id", "businessId", "storeId", "pumpId", "nozzleNumber", "gradeId", "tankId", "updatedAt")
SELECT gen_random_uuid()::text, p."businessId", p."storeId", p."id", n.num, p."gradeId",
       (SELECT t."id" FROM "FuelTank" t
         WHERE t."businessId" = p."businessId" AND t."storeId" = p."storeId" AND t."gradeId" = p."gradeId" AND t."isActive" = true
         ORDER BY t."tankNumber" ASC LIMIT 1),
       CURRENT_TIMESTAMP
FROM "FuelPump" p
CROSS JOIN LATERAL generate_series(1, GREATEST(p."nozzleCount", 1)) AS n(num)
WHERE NOT EXISTS (SELECT 1 FROM "FuelNozzle" z WHERE z."pumpId" = p."id");
