-- Link a delivery to the field/agent order it was dispatched from, so the driver
-- app inbox and the field-sales board reflect the same state.
ALTER TABLE "DeliveryOrder" ADD COLUMN IF NOT EXISTS "fieldOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "DeliveryOrder_fieldOrderId_idx" ON "DeliveryOrder"("fieldOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryOrder_driverId_status_idx" ON "DeliveryOrder"("driverId", "status");
