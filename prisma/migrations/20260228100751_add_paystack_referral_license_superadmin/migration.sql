-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerBusinessId" TEXT NOT NULL,
    "referredBusinessId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rewardCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Referral_referrerBusinessId_fkey" FOREIGN KEY ("referrerBusinessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LicenseKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "businessId" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'STARTER',
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SuperAdmin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'VAT',
    "serviceChargeRate" REAL NOT NULL DEFAULT 10,
    "negativePolicyDefault" TEXT NOT NULL DEFAULT 'BLOCK',
    "posMode" TEXT NOT NULL DEFAULT 'RETAIL',
    "expiredItemPolicy" TEXT NOT NULL DEFAULT 'BLOCK',
    "expenseApprovalThresholdCents" INTEGER DEFAULT 500000,
    "etimsCredentialsEncrypted" TEXT,
    "mpesaCredentialsEncrypted" TEXT,
    "atCredentialsEncrypted" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" DATETIME,
    "planName" TEXT NOT NULL DEFAULT 'STARTER',
    "paystackCustomerId" TEXT,
    "paystackSubscriptionId" TEXT,
    "referralCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exchangeRates" TEXT,
    "displayCurrencies" TEXT
);
INSERT INTO "new_Business" ("atCredentialsEncrypted", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "id", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "posMode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt") SELECT "atCredentialsEncrypted", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "id", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "posMode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");
CREATE INDEX "Business_referralCode_idx" ON "Business"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "Referral"("code");

-- CreateIndex
CREATE INDEX "Referral_referrerBusinessId_idx" ON "Referral"("referrerBusinessId");

-- CreateIndex
CREATE INDEX "Referral_code_idx" ON "Referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseKey_key_key" ON "LicenseKey"("key");

-- CreateIndex
CREATE INDEX "LicenseKey_businessId_idx" ON "LicenseKey"("businessId");

-- CreateIndex
CREATE INDEX "LicenseKey_key_idx" ON "LicenseKey"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SuperAdmin_email_key" ON "SuperAdmin"("email");
