-- AlterTable: make businessId unique on LoyaltyProgram (one program per business)
CREATE UNIQUE INDEX IF NOT EXISTS "LoyaltyProgram_businessId_key" ON "LoyaltyProgram"("businessId");
