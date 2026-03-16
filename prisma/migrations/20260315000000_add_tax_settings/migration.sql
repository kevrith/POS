-- Add serviceChargeDefault to Business
-- taxType already supports any string value; 'NONE' is now a valid option alongside 'VAT'/'TOT'
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "serviceChargeDefault" BOOLEAN NOT NULL DEFAULT false;
