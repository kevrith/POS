-- Add KRA PIN to Customer
ALTER TABLE "Customer" ADD COLUMN "kraPin" TEXT;

-- Add outcome, businessId, GPS to AgentVisit
ALTER TABLE "AgentVisit" ADD COLUMN "businessId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AgentVisit" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'VISITED';
ALTER TABLE "AgentVisit" ADD COLUMN "gpsLat" DOUBLE PRECISION;
ALTER TABLE "AgentVisit" ADD COLUMN "gpsLng" DOUBLE PRECISION;

CREATE INDEX "AgentVisit_businessId_idx" ON "AgentVisit"("businessId");
