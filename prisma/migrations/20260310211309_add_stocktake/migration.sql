-- CreateTable
CREATE TABLE "StocktakeSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startedAt" DATETIME,
    "finalizedAt" DATETIME,
    "createdBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StocktakeCount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "systemQty" REAL NOT NULL,
    "countedQty" REAL,
    "varianceQty" REAL,
    "note" TEXT,
    "countedAt" DATETIME,
    "countedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StocktakeCount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StocktakeSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StocktakeSession_businessId_idx" ON "StocktakeSession"("businessId");

-- CreateIndex
CREATE INDEX "StocktakeSession_storeId_idx" ON "StocktakeSession"("storeId");

-- CreateIndex
CREATE INDEX "StocktakeCount_sessionId_idx" ON "StocktakeCount"("sessionId");

-- CreateIndex
CREATE INDEX "StocktakeCount_itemId_idx" ON "StocktakeCount"("itemId");
