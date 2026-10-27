-- Brings migrations back in line with schema.prisma for objects that were
-- only ever applied with `db push`. Idempotent so databases that already
-- have them (e.g. production) are unaffected.

-- WebAuthn (passkey) credentials
CREATE TABLE IF NOT EXISTS "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKeyDer" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX IF NOT EXISTS "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WebAuthnCredential_userId_fkey'
  ) THEN
    ALTER TABLE "WebAuthnCredential"
      ADD CONSTRAINT "WebAuthnCredential_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Customer portal / storefront lookups by shop code
CREATE INDEX IF NOT EXISTS "Customer_shopCode_idx" ON "Customer"("shopCode");

-- Loyalty: schema default for the minimum redemption
ALTER TABLE "LoyaltyProgram" ALTER COLUMN "minRedemption" SET DEFAULT 100;
