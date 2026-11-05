-- A prescription fill becomes a real sale once a business is on the sales pipeline. The insurer's share of it is
-- an insurance claim, so the claim keeps the sale it was invoiced on (the receivable it later clears).
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.
ALTER TABLE "InsuranceClaim" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
