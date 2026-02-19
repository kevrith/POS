/*
  Warnings:

  - A unique constraint covering the columns `[offlineId]` on the table `Item` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `businessId` to the `InventoryMovement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Item" ADD COLUMN "offlineId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchId" TEXT,
    "saleId" TEXT,
    "recipeItemId" TEXT,
    "bundleItemId" TEXT,
    "grnId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryMovement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryMovement" ("batchId", "bundleItemId", "createdAt", "grnId", "id", "itemId", "offlineId", "quantity", "recipeItemId", "saleId", "source", "storeId", "type") SELECT "batchId", "bundleItemId", "createdAt", "grnId", "id", "itemId", "offlineId", "quantity", "recipeItemId", "saleId", "source", "storeId", "type" FROM "InventoryMovement";
DROP TABLE "InventoryMovement";
ALTER TABLE "new_InventoryMovement" RENAME TO "InventoryMovement";
CREATE UNIQUE INDEX "InventoryMovement_offlineId_key" ON "InventoryMovement"("offlineId");
CREATE INDEX "InventoryMovement_businessId_itemId_createdAt_idx" ON "InventoryMovement"("businessId", "itemId", "createdAt");
CREATE INDEX "InventoryMovement_type_idx" ON "InventoryMovement"("type");
CREATE INDEX "InventoryMovement_offlineId_idx" ON "InventoryMovement"("offlineId");
CREATE TABLE "new_Layaway" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "saleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "remainingCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Layaway_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Layaway_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Layaway" ("businessId", "createdAt", "customerId", "id", "offlineId", "paidCents", "remainingCents", "saleId", "status", "storeId", "totalCents", "updatedAt") SELECT "businessId", "createdAt", "customerId", "id", "offlineId", "paidCents", "remainingCents", "saleId", "status", "storeId", "totalCents", "updatedAt" FROM "Layaway";
DROP TABLE "Layaway";
ALTER TABLE "new_Layaway" RENAME TO "Layaway";
CREATE UNIQUE INDEX "Layaway_offlineId_key" ON "Layaway"("offlineId");
CREATE UNIQUE INDEX "Layaway_saleId_key" ON "Layaway"("saleId");
CREATE INDEX "Layaway_businessId_customerId_status_idx" ON "Layaway"("businessId", "customerId", "status");
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

-- CreateIndex
CREATE UNIQUE INDEX "Item_offlineId_key" ON "Item"("offlineId");

-- CreateIndex
CREATE INDEX "Item_offlineId_idx" ON "Item"("offlineId");
