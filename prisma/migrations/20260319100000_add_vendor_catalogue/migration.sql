CREATE TABLE IF NOT EXISTS "SupplierCatalogueItem" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "barcode" TEXT,
  "unitCostCents" INTEGER NOT NULL DEFAULT 0,
  "unitLabel" TEXT NOT NULL DEFAULT 'unit',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierCatalogueItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierCatalogueItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupplierCatalogueItem_businessId_supplierId_idx" ON "SupplierCatalogueItem"("businessId", "supplierId");
CREATE INDEX IF NOT EXISTS "SupplierCatalogueItem_barcode_idx" ON "SupplierCatalogueItem"("barcode");
