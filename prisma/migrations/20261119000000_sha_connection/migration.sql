-- A business's own connection to the Social Health Authority's eligibility service (credentials entered by the facility, secret
-- stored encrypted). Safe to run again.

CREATE TABLE IF NOT EXISTS "ShaConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "facilityCode" TEXT NOT NULL,
    "tokenPath" TEXT NOT NULL DEFAULT '/tenants/token',
    "eligibilityPath" TEXT NOT NULL DEFAULT '/patients/eligibility',
    "tokenFormat" TEXT NOT NULL DEFAULT 'json',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShaConnection_businessId_key" ON "ShaConnection"("businessId");
