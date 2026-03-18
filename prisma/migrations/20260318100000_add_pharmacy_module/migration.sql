-- Pharmacy fields on Item
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "requiresPrescription" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "genericName" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "drugClass" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "scheduleClass" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "dosageForm" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "strength" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "interactionWarnings" TEXT NOT NULL DEFAULT '[]';

-- Refill tracking on Prescription
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "refillsAllowed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "refillsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "lastFillDate" TIMESTAMP(3);
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "nextFillDate" TIMESTAMP(3);
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "patientIdNumber" TEXT;

-- DrugInteraction
CREATE TABLE IF NOT EXISTS "DrugInteraction" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "drug1Name" TEXT NOT NULL,
  "drug2Name" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MODERATE',
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DrugInteraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DrugInteraction_businessId_idx" ON "DrugInteraction"("businessId");

-- InsuranceProvider
CREATE TABLE IF NOT EXISTS "InsuranceProvider" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsuranceProvider_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InsuranceProvider_businessId_idx" ON "InsuranceProvider"("businessId");

-- InsuranceClaim
CREATE TABLE IF NOT EXISTS "InsuranceClaim" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "prescriptionId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "patientInsuranceId" TEXT,
  "claimNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "billedCents" INTEGER NOT NULL DEFAULT 0,
  "approvedCents" INTEGER NOT NULL DEFAULT 0,
  "paidCents" INTEGER NOT NULL DEFAULT 0,
  "copayPct" INTEGER NOT NULL DEFAULT 0,
  "rejectionReason" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InsuranceClaim_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "InsuranceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "InsuranceClaim_businessId_idx" ON "InsuranceClaim"("businessId");
CREATE INDEX IF NOT EXISTS "InsuranceClaim_prescriptionId_idx" ON "InsuranceClaim"("prescriptionId");

-- ControlledSubstanceLog
CREATE TABLE IF NOT EXISTS "ControlledSubstanceLog" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "prescriptionId" TEXT,
  "itemName" TEXT NOT NULL,
  "scheduleClass" TEXT NOT NULL,
  "quantityDispensed" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'units',
  "patientName" TEXT NOT NULL,
  "patientIdNumber" TEXT,
  "prescriberName" TEXT NOT NULL,
  "prescriberLicense" TEXT,
  "dispensedBy" TEXT NOT NULL,
  "dispensedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlledSubstanceLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ControlledSubstanceLog_businessId_idx" ON "ControlledSubstanceLog"("businessId");
CREATE INDEX IF NOT EXISTS "ControlledSubstanceLog_dispensedAt_idx" ON "ControlledSubstanceLog"("dispensedAt");
