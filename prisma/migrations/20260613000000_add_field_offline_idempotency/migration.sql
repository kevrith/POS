-- Offline idempotency for the field-sales agent app.

-- Customer: idempotency key for offline customer registration
ALTER TABLE "Customer" ADD COLUMN "offlineId" TEXT;
CREATE UNIQUE INDEX "Customer_offlineId_key" ON "Customer"("offlineId");

-- FieldOrderPayment: audit trail + idempotency for offline payment replay
CREATE TABLE "FieldOrderPayment" (
    "id" TEXT NOT NULL,
    "offlineId" TEXT,
    "fieldOrderId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "collectedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldOrderPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FieldOrderPayment_offlineId_key" ON "FieldOrderPayment"("offlineId");
CREATE INDEX "FieldOrderPayment_fieldOrderId_idx" ON "FieldOrderPayment"("fieldOrderId");
CREATE INDEX "FieldOrderPayment_businessId_idx" ON "FieldOrderPayment"("businessId");

ALTER TABLE "FieldOrderPayment" ADD CONSTRAINT "FieldOrderPayment_fieldOrderId_fkey" FOREIGN KEY ("fieldOrderId") REFERENCES "FieldOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
