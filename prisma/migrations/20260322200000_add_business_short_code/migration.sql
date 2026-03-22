-- Add shortCode to Business (unique human-readable code for PIN login)
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "shortCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Business_shortCode_key" ON "Business"("shortCode");
