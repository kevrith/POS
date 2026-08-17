-- Granting a plan from the super-admin console set the same fields a real payment
-- sets, so a gifted account was indistinguishable from a paying one — and MRR,
-- which multiplies each ACTIVE business by its list price, counted revenue that
-- was never collected. Comped accounts are now flagged and left out of it.
ALTER TABLE "Business" ADD COLUMN "isComped" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "compedReason" TEXT;
