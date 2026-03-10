-- CreateTable
CREATE TABLE "HotelRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "floor" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "pricePerNightCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "amenities" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoomBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "guestIdNumber" TEXT,
    "checkInDate" DATETIME NOT NULL,
    "checkOutDate" DATETIME,
    "actualCheckIn" DATETIME,
    "actualCheckOut" DATETIME,
    "nightCount" INTEGER NOT NULL DEFAULT 1,
    "pricePerNightCents" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "notes" TEXT,
    "orderId" TEXT,
    "saleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoomBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HotelRoom_businessId_storeId_status_idx" ON "HotelRoom"("businessId", "storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HotelRoom_businessId_storeId_number_key" ON "HotelRoom"("businessId", "storeId", "number");

-- CreateIndex
CREATE INDEX "RoomBooking_businessId_storeId_status_idx" ON "RoomBooking"("businessId", "storeId", "status");

-- CreateIndex
CREATE INDEX "RoomBooking_roomId_idx" ON "RoomBooking"("roomId");
