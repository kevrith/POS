-- Add hardware feature toggles to Business
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "enableCashDrawer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "enableBarcodeScanner" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "enablePoleDisplay" BOOLEAN NOT NULL DEFAULT false;
