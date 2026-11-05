-- Hotel invoicing: the stay becomes a real Sale at check-out, with optional levies and a deposit register.
--
--   Business.hotelLevies      optional levies (tourism, catering) a hotel adds to a stay, as JSON
--                             [{ name, ratePct, base: "ROOM" | "ALL" }]. '[]' = none, which is every business today.
--   RoomBooking.guestKraPin   the buyer's PIN for a corporate guest, printed on the invoice.
--   CashMovement              money in or out outside a sale (a hotel deposit taken, a deposit refunded). The cash
--                             drawer adds the CASH ones to expected cash. Only written after a business's cutover
--                             (Business.verticalSalesFrom), so nothing changes for a business still off.
--
-- No existing row changes.

ALTER TABLE "Business" ADD COLUMN "hotelLevies" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RoomBooking" ADD COLUMN "guestKraPin" TEXT;

CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cashierId" TEXT,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashMovement_businessId_storeId_createdAt_idx" ON "CashMovement"("businessId", "storeId", "createdAt");
CREATE INDEX "CashMovement_bookingId_idx" ON "CashMovement"("bookingId");
