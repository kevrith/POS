-- CreateTable
CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ItemUOM" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "unitName" TEXT NOT NULL,
    "unitAbbrev" TEXT NOT NULL,
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isBaseUnit" BOOLEAN NOT NULL DEFAULT false,
    "priceCents" INTEGER,
    "barcode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemUOM_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Category_businessId_idx" ON "Category"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Category_businessId_name_key" ON "Category"("businessId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Item_categoryId_idx" ON "Item"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemUOM_itemId_idx" ON "ItemUOM"("itemId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ItemUOM_barcode_idx" ON "ItemUOM"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ItemUOM_itemId_unitName_key" ON "ItemUOM"("itemId", "unitName");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Category_businessId_fkey') THEN
    ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Item_categoryId_fkey') THEN
    ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ItemUOM_itemId_fkey') THEN
    ALTER TABLE "ItemUOM" ADD CONSTRAINT "ItemUOM_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
