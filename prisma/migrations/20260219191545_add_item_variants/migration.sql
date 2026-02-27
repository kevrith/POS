-- CreateTable
CREATE TABLE "ItemVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "retailPriceCents" INTEGER NOT NULL,
    "wholesalePriceCents" INTEGER,
    "vipPriceCents" INTEGER,
    "costPriceCents" INTEGER,
    "attributes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItemVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_sku_key" ON "ItemVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVariant_barcode_key" ON "ItemVariant"("barcode");

-- CreateIndex
CREATE INDEX "ItemVariant_itemId_idx" ON "ItemVariant"("itemId");

-- CreateIndex
CREATE INDEX "ItemVariant_barcode_idx" ON "ItemVariant"("barcode");

-- CreateIndex
CREATE INDEX "ItemVariant_sku_idx" ON "ItemVariant"("sku");
