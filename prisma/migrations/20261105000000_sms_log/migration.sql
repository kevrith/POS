-- Per-SMS log: usage per business, and the data behind the hourly send caps.
-- Additive and safe to re-run.
CREATE TABLE IF NOT EXISTS "SmsLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SmsLog_businessId_channel_createdAt_idx" ON "SmsLog"("businessId", "channel", "createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_phone_purpose_createdAt_idx" ON "SmsLog"("phone", "purpose", "createdAt");
