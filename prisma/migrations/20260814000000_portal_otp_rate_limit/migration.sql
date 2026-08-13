-- A 6-digit OTP with a 10-minute window and unlimited guesses is brute-forceable, and
-- every request-otp call also spends an SMS credit. Both limits live on the session row
-- rather than in process memory so they survive a restart and hold across instances.
ALTER TABLE "CustomerPortalSession" ADD COLUMN "otpAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerPortalSession" ADD COLUMN "otpSentAt" TIMESTAMP(3);

-- Existing pending OTPs have no send time; treat the row's creation as the last send so
-- the cooldown has something sane to measure against.
UPDATE "CustomerPortalSession" SET "otpSentAt" = "createdAt" WHERE "otpHash" IS NOT NULL;
