-- Salon / spa, first phase: services with a duration, client notes, the stylist on an invoice line (so commission goes to them),
-- several services per appointment, and who takes appointments and when. Safe to run again.

ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "staffId" TEXT;
CREATE INDEX IF NOT EXISTS "SaleItem_staffId_idx" ON "SaleItem"("staffId");

CREATE TABLE IF NOT EXISTS "AppointmentService" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "staffId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AppointmentService_appointmentId_idx" ON "AppointmentService"("appointmentId");
CREATE INDEX IF NOT EXISTS "AppointmentService_staffId_idx" ON "AppointmentService"("staffId");

CREATE TABLE IF NOT EXISTS "ServiceStaff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "workingHours" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceStaff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceStaff_businessId_userId_key" ON "ServiceStaff"("businessId", "userId");
CREATE INDEX IF NOT EXISTS "ServiceStaff_businessId_idx" ON "ServiceStaff"("businessId");
