-- AddColumn Business: churn tracking
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- CreateTable SuperAdminIpWhitelist
CREATE TABLE IF NOT EXISTS "SuperAdminIpWhitelist" (
    "id"        TEXT NOT NULL,
    "ip"        TEXT NOT NULL,
    "label"     TEXT,
    "addedBy"   TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuperAdminIpWhitelist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SuperAdminIpWhitelist_ip_key" ON "SuperAdminIpWhitelist"("ip");

-- CreateTable SuperAdminAuditLog
CREATE TABLE IF NOT EXISTS "SuperAdminAuditLog" (
    "id"         TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action"     TEXT NOT NULL,
    "targetId"   TEXT,
    "targetType" TEXT,
    "details"    TEXT,
    "ipAddress"  TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_adminEmail_idx" ON "SuperAdminAuditLog"("adminEmail");
CREATE INDEX IF NOT EXISTS "SuperAdminAuditLog_createdAt_idx" ON "SuperAdminAuditLog"("createdAt");
