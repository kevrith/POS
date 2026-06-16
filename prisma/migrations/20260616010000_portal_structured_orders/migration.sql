-- Structured online/portal orders on DeliveryOrder
ALTER TABLE "DeliveryOrder" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'POS';
ALTER TABLE "DeliveryOrder" ADD COLUMN "fulfillmentType" TEXT NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "DeliveryOrder" ADD COLUMN "subtotalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryOrder" ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryOrder" ADD COLUMN "totalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryOrder" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "DeliveryOrder" ADD COLUMN "paymentRef" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "acceptedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryOrder" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "DeliveryOrder" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "etaMinutes" INTEGER;

-- Structured line items for delivery/portal orders
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "modifiers" TEXT,
    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryOrderItem_deliveryOrderId_idx" ON "DeliveryOrderItem"("deliveryOrderId");
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
