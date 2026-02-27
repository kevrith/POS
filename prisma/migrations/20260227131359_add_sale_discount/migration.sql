-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Sale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "receiptNumber" TEXT,
    "amendmentNumber" TEXT,
    "orderId" TEXT,
    "cashierId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "notes" TEXT,
    "proformaValidUntil" DATETIME,
    "type" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "priceLevel" TEXT NOT NULL DEFAULT 'RETAIL',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "serviceChargeCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "promotionId" TEXT,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "etimsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "etimsControlNumber" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Sale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("amendmentNumber", "businessId", "cashierId", "createdAt", "customerId", "customerName", "customerPhone", "deletedAt", "etimsControlNumber", "etimsSubmitted", "id", "notes", "offlineId", "orderId", "priceLevel", "proformaValidUntil", "receiptNumber", "serviceChargeCents", "status", "storeId", "subtotalCents", "totCents", "totalCents", "type", "updatedAt", "vatCents") SELECT "amendmentNumber", "businessId", "cashierId", "createdAt", "customerId", "customerName", "customerPhone", "deletedAt", "etimsControlNumber", "etimsSubmitted", "id", "notes", "offlineId", "orderId", "priceLevel", "proformaValidUntil", "receiptNumber", "serviceChargeCents", "status", "storeId", "subtotalCents", "totCents", "totalCents", "type", "updatedAt", "vatCents" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_offlineId_key" ON "Sale"("offlineId");
CREATE UNIQUE INDEX "Sale_receiptNumber_key" ON "Sale"("receiptNumber");
CREATE UNIQUE INDEX "Sale_orderId_key" ON "Sale"("orderId");
CREATE INDEX "Sale_businessId_storeId_status_idx" ON "Sale"("businessId", "storeId", "status");
CREATE INDEX "Sale_receiptNumber_idx" ON "Sale"("receiptNumber");
CREATE INDEX "Sale_offlineId_idx" ON "Sale"("offlineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
