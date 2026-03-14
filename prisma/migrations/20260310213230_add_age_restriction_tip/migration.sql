-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PRODUCT',
    "retailPriceCents" INTEGER NOT NULL,
    "wholesalePriceCents" INTEGER,
    "vipPriceCents" INTEGER,
    "costPriceCents" INTEGER,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "trackSerials" BOOLEAN NOT NULL DEFAULT false,
    "trackBatches" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "defaultExpiryDays" INTEGER,
    "negativeStockPolicy" TEXT,
    "weightUnit" TEXT,
    "reorderLevel" INTEGER DEFAULT 0,
    "vatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "totApplicable" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT,
    "category" TEXT,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "minAgeYears" INTEGER NOT NULL DEFAULT 18,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "unitWeightGrams" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Item_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Item" ("barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents") SELECT "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_offlineId_key" ON "Item"("offlineId");
CREATE INDEX "Item_businessId_storeId_idx" ON "Item"("businessId", "storeId");
CREATE INDEX "Item_type_idx" ON "Item"("type");
CREATE INDEX "Item_barcode_idx" ON "Item"("barcode");
CREATE INDEX "Item_offlineId_idx" ON "Item"("offlineId");
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
    "tipCents" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_Sale" ("amendmentNumber", "businessId", "cashierId", "createdAt", "customerId", "customerName", "customerPhone", "deletedAt", "discountCents", "etimsControlNumber", "etimsSubmitted", "id", "notes", "offlineId", "orderId", "priceLevel", "proformaValidUntil", "promotionId", "receiptNumber", "serviceChargeCents", "status", "storeId", "subtotalCents", "totCents", "totalCents", "type", "updatedAt", "vatCents") SELECT "amendmentNumber", "businessId", "cashierId", "createdAt", "customerId", "customerName", "customerPhone", "deletedAt", "discountCents", "etimsControlNumber", "etimsSubmitted", "id", "notes", "offlineId", "orderId", "priceLevel", "proformaValidUntil", "promotionId", "receiptNumber", "serviceChargeCents", "status", "storeId", "subtotalCents", "totCents", "totalCents", "type", "updatedAt", "vatCents" FROM "Sale";
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
