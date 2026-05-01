-- Field Sales / Route-to-Market schema

-- AlterTable Customer (field sales extensions)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopCode"         TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopType"         TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "salesAgentId"     TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "routeId"          TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "paymentTermsDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditApproved"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditApprovedBy" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "creditApprovedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gpsLat"           DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "gpsLng"           DOUBLE PRECISION;

-- Unique index on shopCode
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_shopCode_key" ON "Customer"("shopCode");
CREATE INDEX IF NOT EXISTS "Customer_salesAgentId_idx" ON "Customer"("salesAgentId");
CREATE INDEX IF NOT EXISTS "Customer_routeId_idx" ON "Customer"("routeId");

-- CreateTable SalesRoute
CREATE TABLE IF NOT EXISTS "SalesRoute" (
    "id"           TEXT NOT NULL,
    "businessId"   TEXT NOT NULL,
    "branchId"     TEXT,
    "name"         TEXT NOT NULL,
    "deliveryDays" TEXT NOT NULL DEFAULT '[]',
    "driverUserId" TEXT,
    "color"        TEXT NOT NULL DEFAULT '#6366F1',
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesRoute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SalesRoute_businessId_idx" ON "SalesRoute"("businessId");
CREATE INDEX IF NOT EXISTS "SalesRoute_isActive_idx" ON "SalesRoute"("isActive");

-- CreateTable DeliveryRun
CREATE TABLE IF NOT EXISTS "DeliveryRun" (
    "id"           TEXT NOT NULL,
    "businessId"   TEXT NOT NULL,
    "routeId"      TEXT NOT NULL,
    "date"         DATE NOT NULL,
    "driverUserId" TEXT,
    "status"       TEXT NOT NULL DEFAULT 'PLANNED',
    "notes"        TEXT,
    "startedAt"    TIMESTAMP(3),
    "completedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeliveryRun_businessId_date_idx" ON "DeliveryRun"("businessId", "date");
CREATE INDEX IF NOT EXISTS "DeliveryRun_routeId_idx" ON "DeliveryRun"("routeId");
CREATE INDEX IF NOT EXISTS "DeliveryRun_status_idx" ON "DeliveryRun"("status");

-- CreateTable DeliveryRunOrder
CREATE TABLE IF NOT EXISTS "DeliveryRunOrder" (
    "id"            TEXT NOT NULL,
    "deliveryRunId" TEXT NOT NULL,
    "fieldOrderId"  TEXT NOT NULL,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "deliveredAt"   TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryRunOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRunOrder_deliveryRunId_fieldOrderId_key" ON "DeliveryRunOrder"("deliveryRunId", "fieldOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryRunOrder_deliveryRunId_idx" ON "DeliveryRunOrder"("deliveryRunId");
CREATE INDEX IF NOT EXISTS "DeliveryRunOrder_fieldOrderId_idx" ON "DeliveryRunOrder"("fieldOrderId");

-- CreateTable DeliveryProof
CREATE TABLE IF NOT EXISTS "DeliveryProof" (
    "id"                 TEXT NOT NULL,
    "fieldOrderId"       TEXT NOT NULL,
    "deliveryRunOrderId" TEXT NOT NULL,
    "signatureBase64"    TEXT,
    "receivedByName"     TEXT NOT NULL,
    "latitude"           DOUBLE PRECISION,
    "longitude"          DOUBLE PRECISION,
    "photoUrl"           TEXT,
    "notes"              TEXT,
    "capturedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryProof_deliveryRunOrderId_key" ON "DeliveryProof"("deliveryRunOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryProof_fieldOrderId_idx" ON "DeliveryProof"("fieldOrderId");

-- CreateTable RouteExpense
CREATE TABLE IF NOT EXISTS "RouteExpense" (
    "id"            TEXT NOT NULL,
    "businessId"    TEXT NOT NULL,
    "deliveryRunId" TEXT NOT NULL,
    "category"      TEXT NOT NULL,
    "amountCents"   INTEGER NOT NULL,
    "description"   TEXT,
    "receiptUrl"    TEXT,
    "recordedBy"    TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteExpense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RouteExpense_businessId_idx" ON "RouteExpense"("businessId");
CREATE INDEX IF NOT EXISTS "RouteExpense_deliveryRunId_idx" ON "RouteExpense"("deliveryRunId");

-- CreateTable FieldOrder
CREATE TABLE IF NOT EXISTS "FieldOrder" (
    "id"                   TEXT NOT NULL,
    "offlineId"            TEXT NOT NULL,
    "businessId"           TEXT NOT NULL,
    "storeId"              TEXT,
    "orderNumber"          TEXT,
    "agentId"              TEXT NOT NULL,
    "customerId"           TEXT NOT NULL,
    "routeId"              TEXT,
    "status"               TEXT NOT NULL DEFAULT 'DRAFT',
    "subtotalCents"        INTEGER NOT NULL DEFAULT 0,
    "vatCents"             INTEGER NOT NULL DEFAULT 0,
    "totalCents"           INTEGER NOT NULL DEFAULT 0,
    "isSampleOrder"        BOOLEAN NOT NULL DEFAULT false,
    "notes"                TEXT,
    "rejectionReason"      TEXT,
    "expectedDeliveryDate" TIMESTAMP(3),
    "paymentStatus"        TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentMethod"        TEXT,
    "mpesaReference"       TEXT,
    "paidAmountCents"      INTEGER NOT NULL DEFAULT 0,
    "confirmedAt"          TIMESTAMP(3),
    "packedAt"             TIMESTAMP(3),
    "dispatchedAt"         TIMESTAMP(3),
    "deliveredAt"          TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FieldOrder_offlineId_key" ON "FieldOrder"("offlineId");
CREATE UNIQUE INDEX IF NOT EXISTS "FieldOrder_orderNumber_key" ON "FieldOrder"("orderNumber");
CREATE INDEX IF NOT EXISTS "FieldOrder_businessId_status_idx" ON "FieldOrder"("businessId", "status");
CREATE INDEX IF NOT EXISTS "FieldOrder_agentId_idx" ON "FieldOrder"("agentId");
CREATE INDEX IF NOT EXISTS "FieldOrder_customerId_idx" ON "FieldOrder"("customerId");
CREATE INDEX IF NOT EXISTS "FieldOrder_routeId_idx" ON "FieldOrder"("routeId");
CREATE INDEX IF NOT EXISTS "FieldOrder_orderNumber_idx" ON "FieldOrder"("orderNumber");
CREATE INDEX IF NOT EXISTS "FieldOrder_paymentStatus_idx" ON "FieldOrder"("paymentStatus");

-- CreateTable FieldOrderItem
CREATE TABLE IF NOT EXISTS "FieldOrderItem" (
    "id"                TEXT NOT NULL,
    "fieldOrderId"      TEXT NOT NULL,
    "itemId"            TEXT,
    "itemName"          TEXT NOT NULL,
    "itemSku"           TEXT,
    "quantity"          INTEGER NOT NULL,
    "unitPriceCents"    INTEGER NOT NULL,
    "totalCents"        INTEGER NOT NULL,
    "isSample"          BOOLEAN NOT NULL DEFAULT false,
    "deliveredQuantity" INTEGER NOT NULL DEFAULT 0,
    "backOrderQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FieldOrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FieldOrderItem_fieldOrderId_idx" ON "FieldOrderItem"("fieldOrderId");
CREATE INDEX IF NOT EXISTS "FieldOrderItem_itemId_idx" ON "FieldOrderItem"("itemId");

-- CreateTable CreditApprovalRequest
CREATE TABLE IF NOT EXISTS "CreditApprovalRequest" (
    "id"                  TEXT NOT NULL,
    "businessId"          TEXT NOT NULL,
    "customerId"          TEXT NOT NULL,
    "fieldOrderId"        TEXT,
    "requestedBy"         TEXT NOT NULL,
    "currentLimitCents"   INTEGER NOT NULL,
    "requestedLimitCents" INTEGER NOT NULL,
    "orderTotalCents"     INTEGER NOT NULL DEFAULT 0,
    "reason"              TEXT,
    "status"              TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy"          TEXT,
    "reviewedAt"          TIMESTAMP(3),
    "reviewNote"          TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditApprovalRequest_businessId_status_idx" ON "CreditApprovalRequest"("businessId", "status");
CREATE INDEX IF NOT EXISTS "CreditApprovalRequest_customerId_idx" ON "CreditApprovalRequest"("customerId");
CREATE INDEX IF NOT EXISTS "CreditApprovalRequest_requestedBy_idx" ON "CreditApprovalRequest"("requestedBy");

-- CreateTable CustomerPortalSession
CREATE TABLE IF NOT EXISTS "CustomerPortalSession" (
    "id"           TEXT NOT NULL,
    "customerId"   TEXT NOT NULL,
    "phone"        TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "otpHash"      TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPortalSession_sessionToken_key" ON "CustomerPortalSession"("sessionToken");
CREATE INDEX IF NOT EXISTS "CustomerPortalSession_customerId_idx" ON "CustomerPortalSession"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerPortalSession_phone_idx" ON "CustomerPortalSession"("phone");

-- CreateTable AgentVisit
CREATE TABLE IF NOT EXISTS "AgentVisit" (
    "id"           TEXT NOT NULL,
    "agentId"      TEXT NOT NULL,
    "customerId"   TEXT NOT NULL,
    "fieldOrderId" TEXT,
    "notes"        TEXT,
    "visitedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentVisit_agentId_idx" ON "AgentVisit"("agentId");
CREATE INDEX IF NOT EXISTS "AgentVisit_customerId_idx" ON "AgentVisit"("customerId");
CREATE INDEX IF NOT EXISTS "AgentVisit_visitedAt_idx" ON "AgentVisit"("visitedAt");

-- AddForeignKeys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_salesAgentId_fkey') THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Customer_routeId_fkey') THEN
    ALTER TABLE "Customer" ADD CONSTRAINT "Customer_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SalesRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRun_routeId_fkey') THEN
    ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SalesRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRun_driverUserId_fkey') THEN
    ALTER TABLE "DeliveryRun" ADD CONSTRAINT "DeliveryRun_driverUserId_fkey" FOREIGN KEY ("driverUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRunOrder_deliveryRunId_fkey') THEN
    ALTER TABLE "DeliveryRunOrder" ADD CONSTRAINT "DeliveryRunOrder_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRunOrder_fieldOrderId_fkey') THEN
    ALTER TABLE "DeliveryRunOrder" ADD CONSTRAINT "DeliveryRunOrder_fieldOrderId_fkey" FOREIGN KEY ("fieldOrderId") REFERENCES "FieldOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryProof_fieldOrderId_fkey') THEN
    ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_fieldOrderId_fkey" FOREIGN KEY ("fieldOrderId") REFERENCES "FieldOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryProof_deliveryRunOrderId_fkey') THEN
    ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_deliveryRunOrderId_fkey" FOREIGN KEY ("deliveryRunOrderId") REFERENCES "DeliveryRunOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RouteExpense_deliveryRunId_fkey') THEN
    ALTER TABLE "RouteExpense" ADD CONSTRAINT "RouteExpense_deliveryRunId_fkey" FOREIGN KEY ("deliveryRunId") REFERENCES "DeliveryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FieldOrder_agentId_fkey') THEN
    ALTER TABLE "FieldOrder" ADD CONSTRAINT "FieldOrder_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FieldOrder_customerId_fkey') THEN
    ALTER TABLE "FieldOrder" ADD CONSTRAINT "FieldOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FieldOrder_routeId_fkey') THEN
    ALTER TABLE "FieldOrder" ADD CONSTRAINT "FieldOrder_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "SalesRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FieldOrderItem_fieldOrderId_fkey') THEN
    ALTER TABLE "FieldOrderItem" ADD CONSTRAINT "FieldOrderItem_fieldOrderId_fkey" FOREIGN KEY ("fieldOrderId") REFERENCES "FieldOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditApprovalRequest_customerId_fkey') THEN
    ALTER TABLE "CreditApprovalRequest" ADD CONSTRAINT "CreditApprovalRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditApprovalRequest_fieldOrderId_fkey') THEN
    ALTER TABLE "CreditApprovalRequest" ADD CONSTRAINT "CreditApprovalRequest_fieldOrderId_fkey" FOREIGN KEY ("fieldOrderId") REFERENCES "FieldOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditApprovalRequest_requestedBy_fkey') THEN
    ALTER TABLE "CreditApprovalRequest" ADD CONSTRAINT "CreditApprovalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditApprovalRequest_reviewedBy_fkey') THEN
    ALTER TABLE "CreditApprovalRequest" ADD CONSTRAINT "CreditApprovalRequest_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerPortalSession_customerId_fkey') THEN
    ALTER TABLE "CustomerPortalSession" ADD CONSTRAINT "CustomerPortalSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentVisit_agentId_fkey') THEN
    ALTER TABLE "AgentVisit" ADD CONSTRAINT "AgentVisit_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AgentVisit_customerId_fkey') THEN
    ALTER TABLE "AgentVisit" ADD CONSTRAINT "AgentVisit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
