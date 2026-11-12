-- Clinic, second phase: a visit takes a patient from the queue through triage and the doctor to the bill, and a prescription can
-- say which visit it was written in. Safe to run again.

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "visitId" TEXT;
CREATE INDEX IF NOT EXISTS "Prescription_visitId_idx" ON "Prescription"("visitId");

CREATE TABLE IF NOT EXISTS "Visit" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "complaint" TEXT,
    "appointmentId" TEXT,
    "doctorId" TEXT,
    "doctorName" TEXT,
    "temperatureC" DOUBLE PRECISION,
    "pulse" INTEGER,
    "respiratoryRate" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "spo2" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "bloodSugarMmol" DOUBLE PRECISION,
    "painScore" INTEGER,
    "triageNotes" TEXT,
    "triagedAt" TIMESTAMP(3),
    "triagedBy" TEXT,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "diagnoses" TEXT NOT NULL DEFAULT '[]',
    "sickLeaveDays" INTEGER,
    "sickLeaveNote" TEXT,
    "referralTo" TEXT,
    "referralNote" TEXT,
    "followUpDate" TIMESTAMP(3),
    "consultStartedAt" TIMESTAMP(3),
    "consultEndedAt" TIMESTAMP(3),
    "saleId" TEXT,
    "cancelReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Visit_businessId_visitNumber_key" ON "Visit"("businessId", "visitNumber");
CREATE INDEX IF NOT EXISTS "Visit_businessId_storeId_status_idx" ON "Visit"("businessId", "storeId", "status");
CREATE INDEX IF NOT EXISTS "Visit_businessId_patientId_idx" ON "Visit"("businessId", "patientId");

CREATE TABLE IF NOT EXISTS "VisitCharge" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VisitCharge_visitId_idx" ON "VisitCharge"("visitId");
