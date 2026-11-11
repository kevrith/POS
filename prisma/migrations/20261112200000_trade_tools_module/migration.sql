-- Bundles / kits, supplier tenders (RFQ) and demand forecasting are now the optional module TRADE_TOOLS: on for the main tills that
-- buy and resell stock (see packages/shared MODULE_POS_MODES), switchable in Settings for the rest. So that no business that already
-- uses them loses the menu entry, switch the module on for every salon, cybercafe or fuel station that has bundles or RFQs.
-- Safe to run again: a module already on is left alone. "enabledModules" is a JSON list stored as text; anything else counts as empty.
UPDATE "Business" b
SET "enabledModules" = (
      (CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) || '"TRADE_TOOLS"'::jsonb
    )::text
WHERE b."posMode" IN ('SALON', 'CYBERCAFE', 'FUEL_PUMP')
  AND NOT ((CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) ? 'TRADE_TOOLS')
  AND (EXISTS (SELECT 1 FROM "RFQ" r WHERE r."businessId" = b."id")
    OR EXISTS (SELECT 1 FROM "BundleComponent" c JOIN "Item" i ON i."id" = c."bundleItemId" WHERE i."businessId" = b."id"));
