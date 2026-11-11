-- Delivery & online orders, field sales and quotes used to show in the menu of EVERY kind of business. They now show only for the
-- main tills that use them (see packages/shared MODULE_POS_MODES), or when the business switched the module on. So that no
-- business that already uses one of them loses its menu entry, switch the module on for every business that has real data in it.
-- Safe to run again: a module already on is left alone, and a business whose main till includes it needs nothing.
--
-- "enabledModules" is a JSON list stored as text, e.g. ["RESTAURANT"]. Text that is not a JSON list is treated as empty.

-- Delivery orders, online-store orders and dispatch
UPDATE "Business" b
SET "enabledModules" = (
      (CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) || '"DELIVERY"'::jsonb
    )::text
WHERE b."posMode" NOT IN ('FAST_FOOD', 'RETAIL', 'SUPERMARKET')
  AND NOT ((CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) ? 'DELIVERY')
  AND EXISTS (SELECT 1 FROM "DeliveryOrder" d WHERE d."businessId" = b."id");

-- Field sales: field orders and routes
UPDATE "Business" b
SET "enabledModules" = (
      (CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) || '"FIELD_SALES"'::jsonb
    )::text
WHERE b."posMode" NOT IN ('RETAIL', 'SUPERMARKET')
  AND NOT ((CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) ? 'FIELD_SALES')
  AND (EXISTS (SELECT 1 FROM "FieldOrder" f WHERE f."businessId" = b."id")
    OR EXISTS (SELECT 1 FROM "SalesRoute" r WHERE r."businessId" = b."id"));

-- Quotes (proforma invoices)
UPDATE "Business" b
SET "enabledModules" = (
      (CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) || '"QUOTES"'::jsonb
    )::text
WHERE b."posMode" NOT IN ('RETAIL', 'SUPERMARKET')
  AND NOT ((CASE WHEN b."enabledModules" ~ '^\s*\[.*\]\s*$' THEN b."enabledModules"::jsonb ELSE '[]'::jsonb END) ? 'QUOTES')
  AND EXISTS (SELECT 1 FROM "Sale" s WHERE s."businessId" = b."id" AND s."type" = 'PROFORMA');
