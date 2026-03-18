ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "soldOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "isFractional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "availableFrom" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "availableTo" TEXT;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "availableDays" TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]';

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "storeId" TEXT,
  "userId" TEXT NOT NULL,
  "clockIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clockOut" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TimeEntry_businessId_userId_idx" ON "TimeEntry"("businessId", "userId");
CREATE INDEX IF NOT EXISTS "TimeEntry_clockIn_idx" ON "TimeEntry"("clockIn");

CREATE TABLE IF NOT EXISTS "NpsResponse" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "saleId" TEXT,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NpsResponse_businessId_idx" ON "NpsResponse"("businessId");
