-- AlterTable
ALTER TABLE "Business" ADD COLUMN "paystackPublicKey" TEXT;

-- AlterTable
ALTER TABLE "StoreTransfer" ADD COLUMN "approvedBy" TEXT;

-- CreateTable
CREATE TABLE "LoyaltyTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL,
    "multiplier" REAL NOT NULL DEFAULT 1.0,
    "color" TEXT NOT NULL DEFAULT 'gray',
    "perksJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "customerId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SupplierCreditNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "creditNumber" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "appliedToPOId" TEXT,
    "issuedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierCreditNote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LoyaltyTier_businessId_minPoints_idx" ON "LoyaltyTier"("businessId", "minPoints");

-- CreateIndex
CREATE INDEX "DataDeletionRequest_businessId_status_idx" ON "DataDeletionRequest"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierCreditNote_creditNumber_key" ON "SupplierCreditNote"("creditNumber");

-- CreateIndex
CREATE INDEX "SupplierCreditNote_businessId_supplierId_idx" ON "SupplierCreditNote"("businessId", "supplierId");
