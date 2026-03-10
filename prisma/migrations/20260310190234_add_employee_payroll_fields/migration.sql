-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "commissionMilestonePercent" REAL DEFAULT 0,
    "salaryBaseCents" INTEGER NOT NULL DEFAULT 0,
    "housingAllowanceCents" INTEGER NOT NULL DEFAULT 0,
    "transportAllowanceCents" INTEGER NOT NULL DEFAULT 0,
    "otherAllowancesCents" INTEGER NOT NULL DEFAULT 0,
    "saccoDeductionCents" INTEGER NOT NULL DEFAULT 0,
    "loanDeductionCents" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "startDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("businessId", "commissionBasis", "commissionMilestonePercent", "commissionRate", "createdAt", "emergencyContact", "employmentType", "id", "idNumber", "salesTargetCents", "startDate", "updatedAt", "userId") SELECT "businessId", "commissionBasis", "commissionMilestonePercent", "commissionRate", "createdAt", "emergencyContact", "employmentType", "id", "idNumber", "salesTargetCents", "startDate", "updatedAt", "userId" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_businessId_idx" ON "Employee"("businessId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
