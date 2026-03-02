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
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
    "etimsCredentialsEncrypted" TEXT,
    "mpesaCredentialsEncrypted" TEXT,
    "atCredentialsEncrypted" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" DATETIME,
    "planName" TEXT NOT NULL DEFAULT 'STARTER',
    "paystackCustomerId" TEXT,
    "paystackSubscriptionId" TEXT,
    "paystackPublicKey" TEXT,
    "referralCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exchangeRates" TEXT,
    "displayCurrencies" TEXT
);
INSERT INTO "new_Business" ("atCredentialsEncrypted", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "id", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "referralCode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt") SELECT "atCredentialsEncrypted", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "id", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "referralCode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");
CREATE INDEX "Business_referralCode_idx" ON "Business"("referralCode");
CREATE TABLE "new_Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "idNumber" TEXT,
    "emergencyContact" TEXT,
    "employmentType" TEXT NOT NULL DEFAULT 'PERMANENT',
    "commissionRate" REAL NOT NULL DEFAULT 0,
    "commissionBasis" TEXT NOT NULL DEFAULT 'SALES_VALUE',
    "salesTargetCents" INTEGER,
    "startDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("businessId", "commissionRate", "createdAt", "emergencyContact", "employmentType", "id", "idNumber", "salesTargetCents", "startDate", "updatedAt", "userId") SELECT "businessId", "commissionRate", "createdAt", "emergencyContact", "employmentType", "id", "idNumber", "salesTargetCents", "startDate", "updatedAt", "userId" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_businessId_idx" ON "Employee"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
