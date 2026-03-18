CREATE TABLE "FormularyEntry" (
  "id"                    TEXT NOT NULL,
  "businessId"            TEXT NOT NULL,
  "genericName"           TEXT NOT NULL,
  "brandName"             TEXT,
  "strength"              TEXT,
  "dosageForm"            TEXT NOT NULL DEFAULT 'TABLET',
  "category"              TEXT NOT NULL DEFAULT 'OTHER',
  "scheduleClass"         TEXT NOT NULL DEFAULT 'OTC',
  "maxDailyDose"          DOUBLE PRECISION,
  "unit"                  TEXT NOT NULL DEFAULT 'mg',
  "contraindicationsText" TEXT,
  "notes"                 TEXT,
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormularyEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FormularyEntry_businessId_idx" ON "FormularyEntry"("businessId");
CREATE INDEX "FormularyEntry_genericName_idx" ON "FormularyEntry"("genericName");
