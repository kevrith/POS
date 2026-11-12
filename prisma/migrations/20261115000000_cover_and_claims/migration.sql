-- Insurance cover checks and claims, third phase. A claim can now come from a clinic visit (no prescription), carries the
-- diagnoses it was raised for, and a cover check records whether the patient's insurance was found good. Safe to run again.

ALTER TABLE "InsuranceProvider" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "InsuranceProvider" ADD COLUMN IF NOT EXISTS "requiresEligibility" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "InsuranceClaim" ALTER COLUMN "prescriptionId" DROP NOT NULL;
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "visitId" TEXT;
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "patientId" TEXT;
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "diagnoses" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "preauthNumber" TEXT;
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "coverCheckId" TEXT;
CREATE INDEX IF NOT EXISTS "InsuranceClaim_visitId_idx" ON "InsuranceClaim"("visitId");
CREATE INDEX IF NOT EXISTS "InsuranceClaim_businessId_status_submittedAt_idx" ON "InsuranceClaim"("businessId", "status", "submittedAt");

CREATE TABLE IF NOT EXISTS "CoverCheck" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "visitId" TEXT,
    "memberNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'MANUAL',
    "reference" TEXT,
    "notes" TEXT,
    "checkedBy" TEXT NOT NULL,
    "checkedByName" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoverCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CoverCheck_businessId_patientId_checkedAt_idx" ON "CoverCheck"("businessId", "patientId", "checkedAt");
CREATE INDEX IF NOT EXISTS "CoverCheck_visitId_idx" ON "CoverCheck"("visitId");
