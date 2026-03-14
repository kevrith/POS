-- CreateTable
CREATE TABLE "GuestFolioCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "totalCents" INTEGER NOT NULL,
    "postedBy" TEXT,
    "saleId" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestFolioCharge_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "RoomBooking" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HotelRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "pricePerNightCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "housekeepingStatus" TEXT NOT NULL DEFAULT 'CLEAN',
    "amenities" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_HotelRoom" ("amenities", "businessId", "capacity", "createdAt", "floor", "id", "notes", "number", "pricePerNightCents", "status", "storeId", "type", "updatedAt") SELECT "amenities", "businessId", "capacity", "createdAt", "floor", "id", "notes", "number", "pricePerNightCents", "status", "storeId", "type", "updatedAt" FROM "HotelRoom";
DROP TABLE "HotelRoom";
ALTER TABLE "new_HotelRoom" RENAME TO "HotelRoom";
CREATE INDEX "HotelRoom_businessId_storeId_status_idx" ON "HotelRoom"("businessId", "storeId", "status");
CREATE UNIQUE INDEX "HotelRoom_businessId_storeId_number_key" ON "HotelRoom"("businessId", "storeId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GuestFolioCharge_bookingId_idx" ON "GuestFolioCharge"("bookingId");

-- CreateIndex
CREATE INDEX "GuestFolioCharge_businessId_idx" ON "GuestFolioCharge"("businessId");
