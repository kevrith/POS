-- Clinic / pharmacy, first phase: a real patient record, the prescription pointing at it, and the log of safety rules
-- that were set aside on purpose. Safe to run again.

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "patientId" TEXT;
CREATE INDEX IF NOT EXISTS "Prescription_businessId_patientId_idx" ON "Prescription"("businessId", "patientId");

CREATE TABLE IF NOT EXISTS "Patient" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "patientNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "sex" TEXT,
    "idNumber" TEXT,
    "address" TEXT,
    "allergies" TEXT NOT NULL DEFAULT '[]',
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "weightKg" DOUBLE PRECISION,
    "pregnant" BOOLEAN NOT NULL DEFAULT false,
    "breastfeeding" BOOLEAN NOT NULL DEFAULT false,
    "bloodGroup" TEXT,
    "nextOfKinName" TEXT,
    "nextOfKinPhone" TEXT,
    "insuranceProviderId" TEXT,
    "insuranceMemberNumber" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_businessId_patientNumber_key" ON "Patient"("businessId", "patientNumber");
CREATE INDEX IF NOT EXISTS "Patient_businessId_name_idx" ON "Patient"("businessId", "name");
CREATE INDEX IF NOT EXISTS "Patient_businessId_phone_idx" ON "Patient"("businessId", "phone");
CREATE INDEX IF NOT EXISTS "Patient_businessId_idNumber_idx" ON "Patient"("businessId", "idNumber");
-- One live patient per ID number in a business (blank IDs are allowed any number of times).
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_businessId_idNumber_live_key" ON "Patient"("businessId", "idNumber") WHERE "idNumber" IS NOT NULL AND "isActive";

CREATE TABLE IF NOT EXISTS "RxSafetyOverride" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "prescriptionId" TEXT,
    "saleId" TEXT,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RxSafetyOverride_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RxSafetyOverride_businessId_createdAt_idx" ON "RxSafetyOverride"("businessId", "createdAt");
CREATE INDEX IF NOT EXISTS "RxSafetyOverride_prescriptionId_idx" ON "RxSafetyOverride"("prescriptionId");
