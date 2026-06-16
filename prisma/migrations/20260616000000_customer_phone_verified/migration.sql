-- Add phoneVerifiedAt to Customer (self-service portal OTP verification timestamp)
ALTER TABLE "Customer" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
