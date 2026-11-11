-- The drug catalogue and the formulary were two lists of the same thing. The formulary (which also holds the daily-dose limit
-- and cautions the safety check uses) is now the only one: copy what is in the old catalogue across. Safe to run again: a drug
-- already in the formulary (same generic name, brand and strength) is not added twice.

ALTER TABLE "FormularyEntry" ADD COLUMN IF NOT EXISTS "defaultInstructions" TEXT;

INSERT INTO "FormularyEntry" ("id", "businessId", "genericName", "brandName", "strength", "dosageForm", "category", "scheduleClass", "defaultInstructions", "unit", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."businessId", d."genericName", d."brandName", d."strength",
       COALESCE(NULLIF(d."dosageForm", ''), 'TABLET'), COALESCE(NULLIF(d."category", ''), 'OTHER'), COALESCE(NULLIF(d."scheduleClass", ''), 'OTC'),
       d."defaultInstructions", 'mg', d."isActive", d."createdAt", CURRENT_TIMESTAMP
FROM "DrugCatalogue" d
WHERE NOT EXISTS (
  SELECT 1 FROM "FormularyEntry" f
  WHERE f."businessId" = d."businessId"
    AND lower(f."genericName") = lower(d."genericName")
    AND lower(COALESCE(f."brandName", '')) = lower(COALESCE(d."brandName", ''))
    AND lower(COALESCE(f."strength", '')) = lower(COALESCE(d."strength", ''))
);
