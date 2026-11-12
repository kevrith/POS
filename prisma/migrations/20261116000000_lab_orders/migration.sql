-- Lab orders and results. A test says what is measured (and the normal range); an order asks for tests on a patient inside an
-- open visit; each ordered test carries its results through entry and a second person's release. Safe to run again.

CREATE TABLE IF NOT EXISTS "LabTest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "specimen" TEXT NOT NULL DEFAULT 'BLOOD',
    "parameters" TEXT NOT NULL DEFAULT '[]',
    "itemId" TEXT,
    "turnaroundHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabTest_businessId_name_key" ON "LabTest"("businessId", "name");
CREATE INDEX IF NOT EXISTS "LabTest_businessId_isActive_idx" ON "LabTest"("businessId", "isActive");

CREATE TABLE IF NOT EXISTS "LabOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ORDERED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "clinicalNotes" TEXT,
    "orderedBy" TEXT NOT NULL,
    "orderedByName" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3),
    "collectedByName" TEXT,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LabOrder_businessId_orderNumber_key" ON "LabOrder"("businessId", "orderNumber");
CREATE INDEX IF NOT EXISTS "LabOrder_businessId_status_idx" ON "LabOrder"("businessId", "status");
CREATE INDEX IF NOT EXISTS "LabOrder_visitId_idx" ON "LabOrder"("visitId");
CREATE INDEX IF NOT EXISTS "LabOrder_patientId_idx" ON "LabOrder"("patientId");

CREATE TABLE IF NOT EXISTS "LabOrderItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "specimen" TEXT NOT NULL DEFAULT 'BLOOD',
    "parameters" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "results" TEXT NOT NULL DEFAULT '[]',
    "comment" TEXT,
    "hasCritical" BOOLEAN NOT NULL DEFAULT false,
    "resultedAt" TIMESTAMP(3),
    "resultedById" TEXT,
    "resultedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedBy" TEXT,
    "amendedNote" TEXT,
    "chargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LabOrderItem_orderId_idx" ON "LabOrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "LabOrderItem_businessId_status_idx" ON "LabOrderItem"("businessId", "status");
