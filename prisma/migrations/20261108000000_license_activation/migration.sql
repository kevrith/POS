-- Licensing for the offline edition.
--
-- Cloud side (LicenseKey): a key is bound to the one server computer that activates it, so a shared key stops working on a
-- second computer, and an admin can release it when a shop replaces its PC.
-- Offline side (LocalLicense): the signed licence an installation holds. One row, id 'local'. It is created empty of rows;
-- nothing changes for the cloud edition, which never reads it.
-- Safe to run again: every statement checks first.

ALTER TABLE "LicenseKey"
  ADD COLUMN IF NOT EXISTS "machineId"  TEXT,
  ADD COLUMN IF NOT EXISTS "hostname"   TEXT,
  ADD COLUMN IF NOT EXISTS "boundAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "LicenseKey_machineId_idx" ON "LicenseKey"("machineId");

CREATE TABLE IF NOT EXISTS "LocalLicense" (
  "id"               TEXT NOT NULL DEFAULT 'local',
  "key"              TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "tier"             TEXT NOT NULL,
  "machineId"        TEXT NOT NULL,
  "licenseExpiresAt" TIMESTAMP(3),
  "tokenExpiresAt"   TIMESTAMP(3) NOT NULL,
  "activatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastRenewedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "serverStatus"     TEXT NOT NULL DEFAULT 'OK',
  "serverMessage"    TEXT,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LocalLicense_pkey" PRIMARY KEY ("id")
);
