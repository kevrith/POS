-- Installed copies of the desktop app, as they report themselves (version, computer, last seen) and whether the platform
-- admin has asked them to update. Written to be safe to run again (see the note in 20261110000000).
CREATE TABLE IF NOT EXISTS "DesktopInstall" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "hostname" TEXT,
    "os" TEXT,
    "appVersion" TEXT NOT NULL,
    "businessId" TEXT,
    "businessName" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateRequestedAt" TIMESTAMP(3),
    "updateRequestedFor" TEXT,

    CONSTRAINT "DesktopInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DesktopInstall_machineId_key" ON "DesktopInstall"("machineId");
CREATE INDEX IF NOT EXISTS "DesktopInstall_lastSeenAt_idx" ON "DesktopInstall"("lastSeenAt");
