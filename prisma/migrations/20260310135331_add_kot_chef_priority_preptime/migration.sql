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
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "unitWeightGrams" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Item_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Item" ("barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "name", "negativeStockPolicy", "offlineId", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents") SELECT "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "name", "negativeStockPolicy", "offlineId", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_offlineId_key" ON "Item"("offlineId");
CREATE INDEX "Item_businessId_storeId_idx" ON "Item"("businessId", "storeId");
CREATE INDEX "Item_type_idx" ON "Item"("type");
CREATE INDEX "Item_barcode_idx" ON "Item"("barcode");
CREATE INDEX "Item_offlineId_idx" ON "Item"("offlineId");
CREATE TABLE "new_KOT" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kotNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "printedAt" DATETIME,
    "preparedAt" DATETIME,
    "assignedChefId" TEXT,
    "estimatedReadyAt" DATETIME,
    "estimatedPrepMinutes" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KOT_assignedChefId_fkey" FOREIGN KEY ("assignedChefId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KOT_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_KOT" ("createdAt", "id", "kotNumber", "orderId", "preparedAt", "printedAt", "status", "type", "updatedAt") SELECT "createdAt", "id", "kotNumber", "orderId", "preparedAt", "printedAt", "status", "type", "updatedAt" FROM "KOT";
DROP TABLE "KOT";
ALTER TABLE "new_KOT" RENAME TO "KOT";
CREATE INDEX "KOT_orderId_idx" ON "KOT"("orderId");
CREATE INDEX "KOT_status_idx" ON "KOT"("status");
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tableId" TEXT,
    "roomNumber" TEXT,
    "waiterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "mode" TEXT NOT NULL DEFAULT 'HOSPITALITY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isVIP" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("businessId", "createdAt", "id", "mode", "offlineId", "roomNumber", "status", "storeId", "tableId", "updatedAt", "waiterId") SELECT "businessId", "createdAt", "id", "mode", "offlineId", "roomNumber", "status", "storeId", "tableId", "updatedAt", "waiterId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_offlineId_key" ON "Order"("offlineId");
CREATE INDEX "Order_businessId_storeId_status_idx" ON "Order"("businessId", "storeId", "status");
CREATE INDEX "Order_offlineId_idx" ON "Order"("offlineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
