-- Add referralNotes to Prescription for "Refer Out" workflow
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "referralNotes" TEXT;
