-- A prescription fill becomes a real sale once a business is on the sales pipeline. The insurer's share of it is
-- an insurance claim, so the claim keeps the sale it was invoiced on (the receivable it later clears).
ALTER TABLE "InsuranceClaim" ADD COLUMN "saleId" TEXT;
