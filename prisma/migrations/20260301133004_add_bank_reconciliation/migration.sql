-- CreateTable
CREATE TABLE "FranchiseReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "franchiseeBusinessId" TEXT NOT NULL,
    "franchiseeBusinessName" TEXT NOT NULL,
    "parentBusinessId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "gmvCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "royaltyCents" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "totalNetCents" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedBy" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "basicSalary" INTEGER NOT NULL,
    "housingAllowance" INTEGER NOT NULL DEFAULT 0,
    "transportAllowance" INTEGER NOT NULL DEFAULT 0,
    "otherAllowances" INTEGER NOT NULL DEFAULT 0,
    "grossPay" INTEGER NOT NULL,
    "payeAmount" INTEGER NOT NULL DEFAULT 0,
    "nhifAmount" INTEGER NOT NULL DEFAULT 0,
    "nssf1Amount" INTEGER NOT NULL DEFAULT 0,
    "nssf2Amount" INTEGER NOT NULL DEFAULT 0,
    "housingLevyAmount" INTEGER NOT NULL DEFAULT 0,
    "otherDeductions" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "totalCredits" INTEGER NOT NULL DEFAULT 0,
    "totalDebits" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "BankStatementEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reference" TEXT,
    "matchedSaleId" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    CONSTRAINT "BankStatementEntry_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "displayCurrencies" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "bankBranch" TEXT,
    "idleMessage" TEXT DEFAULT 'Welcome!',
    "idleLogoUrl" TEXT,
    "parentBusinessId" TEXT,
    "franchiseFee" REAL DEFAULT 0,
    "royaltyRate" REAL DEFAULT 0,
    CONSTRAINT "Business_parentBusinessId_fkey" FOREIGN KEY ("parentBusinessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("atCredentialsEncrypted", "bankAccountName", "bankAccountNumber", "bankBranch", "bankName", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "expiryAlertDays", "id", "idleLogoUrl", "idleMessage", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "referralCode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt") SELECT "atCredentialsEncrypted", "bankAccountName", "bankAccountNumber", "bankBranch", "bankName", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "expiryAlertDays", "id", "idleLogoUrl", "idleMessage", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "referralCode", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "taxType", "trialEndsAt", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");
CREATE INDEX "Business_referralCode_idx" ON "Business"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FranchiseReport_franchiseeBusinessId_month_year_key" ON "FranchiseReport"("franchiseeBusinessId", "month", "year");

-- CreateIndex
CREATE INDEX "PayrollRun_businessId_idx" ON "PayrollRun"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_businessId_month_year_key" ON "PayrollRun"("businessId", "month", "year");

-- CreateIndex
CREATE INDEX "Payslip_payrollRunId_idx" ON "Payslip"("payrollRunId");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE INDEX "BankStatement_businessId_idx" ON "BankStatement"("businessId");

-- CreateIndex
CREATE INDEX "BankStatementEntry_statementId_idx" ON "BankStatementEntry"("statementId");

-- CreateIndex
CREATE INDEX "BankStatementEntry_matchStatus_idx" ON "BankStatementEntry"("matchStatus");
