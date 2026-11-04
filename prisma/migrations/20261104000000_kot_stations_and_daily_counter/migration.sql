-- Safe to run more than once: every statement tolerates objects that already exist,
-- so a half-applied or retried deploy cannot fail on "already exists".
--
-- Kitchen tickets: stations, a real "sent" marker, a daily ticket counter, and
-- per-business optional modules.
--
-- Item.station          which preparation area makes the item (KITCHEN / BAR /
--                       DESSERT). NULL means "work it out from the name/category",
--                       which is what printer routing used to do for every item.
-- OrderItem.sentToKitchenAt
--                       stamped when a line goes onto a ticket. firedAt cannot
--                       serve: it means "this course was fired" on the web order
--                       panel, so reusing it hid the Fire button and let the
--                       phone send the same lines twice.
-- KOT.station           one ticket per station, so the bar can mark drinks ready
--                       without touching the kitchen's food.
-- KotCounter            daily per-store ticket number (#1, #2, ...).
-- Business.enabledModules
--                       extra modules a business turns on regardless of its
--                       posMode (a fuel station with a restaurant, a hotel with
--                       a shop).

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "station" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "sentToKitchenAt" TIMESTAMP(3);
ALTER TABLE "KOT" ADD COLUMN IF NOT EXISTS "station" TEXT NOT NULL DEFAULT 'KITCHEN';
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "enabledModules" TEXT NOT NULL DEFAULT '[]';

-- Lines that already have a ticket count as sent, otherwise every historical
-- open order would offer to send its whole bill to the kitchen again.
UPDATE "OrderItem" oi
SET "sentToKitchenAt" = COALESCE(oi."firedAt", oi."createdAt")
WHERE oi."sentToKitchenAt" IS NULL
  AND EXISTS (SELECT 1 FROM "KOT" k WHERE k."orderId" = oi."orderId");

CREATE TABLE IF NOT EXISTS "KotCounter" (
    "storeId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KotCounter_pkey" PRIMARY KEY ("storeId","day")
);

CREATE INDEX IF NOT EXISTS "KOT_station_idx" ON "KOT"("station");

-- Same backstop the lock-down migration applied to every table that existed then.
ALTER TABLE "KotCounter" ENABLE ROW LEVEL SECURITY;
