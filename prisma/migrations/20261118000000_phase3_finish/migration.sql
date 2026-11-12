-- Finishing the clinic and pharmacy work: follow-up contact on visits, resubmitted claims, the credit note a supplier return
-- produces, and acknowledgement of critical lab results. Safe to run again.

ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "followUpContactedAt" TIMESTAMP(3);
ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "followUpContactedBy" TEXT;

ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "resubmittedFromId" TEXT;
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "resubmittedToId" TEXT;

ALTER TABLE "SupplierReturn" ADD COLUMN IF NOT EXISTS "creditNoteId" TEXT;

ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "criticalAckAt" TIMESTAMP(3);
ALTER TABLE "LabOrderItem" ADD COLUMN IF NOT EXISTS "criticalAckBy" TEXT;
