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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "reorderQty" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Item_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Item" ("ageRestricted", "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "minAgeYears", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents") SELECT "ageRestricted", "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "minAgeYears", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_offlineId_key" ON "Item"("offlineId");
CREATE INDEX "Item_businessId_storeId_idx" ON "Item"("businessId", "storeId");
CREATE INDEX "Item_type_idx" ON "Item"("type");
CREATE INDEX "Item_barcode_idx" ON "Item"("barcode");
CREATE INDEX "Item_offlineId_idx" ON "Item"("offlineId");
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
    "coverCount" INTEGER NOT NULL DEFAULT 1,
    "tableNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("businessId", "createdAt", "id", "isVIP", "mode", "offlineId", "priority", "roomNumber", "status", "storeId", "tableId", "updatedAt", "waiterId") SELECT "businessId", "createdAt", "id", "isVIP", "mode", "offlineId", "priority", "roomNumber", "status", "storeId", "tableId", "updatedAt", "waiterId" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_offlineId_key" ON "Order"("offlineId");
CREATE INDEX "Order_businessId_storeId_status_idx" ON "Order"("businessId", "storeId", "status");
CREATE INDEX "Order_offlineId_idx" ON "Order"("offlineId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pin" TEXT,
    "pinHash" TEXT,
    "totpSecret" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "deviceToken" TEXT,
    "phone" TEXT,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "businessId", "createdAt", "deviceToken", "email", "googleId", "id", "name", "passwordHash", "phone", "pin", "pinHash", "role", "totpSecret", "updatedAt") SELECT "avatarUrl", "businessId", "createdAt", "deviceToken", "email", "googleId", "id", "name", "passwordHash", "phone", "pin", "pinHash", "role", "totpSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE INDEX "User_businessId_role_idx" ON "User"("businessId", "role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
