-- Suppliers had a single free-text "contact" field holding either a phone or an email,
-- so nothing could actually be dialled or mailed. Split it into real columns; `contact`
-- stays as-is so existing rows keep their data.
ALTER TABLE "Supplier" ADD COLUMN "phone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "email" TEXT;

-- Best-effort backfill: a contact that is clearly an email goes to email, one that is
-- mostly digits goes to phone. Anything ambiguous is left for the user to fix by hand.
UPDATE "Supplier" SET "email" = "contact"
  WHERE "contact" LIKE '%@%.%' AND "contact" NOT LIKE '% %';
UPDATE "Supplier" SET "phone" = "contact"
  WHERE "contact" IS NOT NULL
    AND "contact" NOT LIKE '%@%'
    AND regexp_replace("contact", '[^0-9]', '', 'g') <> ''
    AND length(regexp_replace("contact", '[^0-9]', '', 'g')) BETWEEN 9 AND 15;

-- RFQ invitations: a supplier row now exists from the moment they are invited, with an
-- opaque token they use to submit their own price instead of the buyer retyping it.
ALTER TABLE "RFQResponse" ADD COLUMN "token" TEXT;
ALTER TABLE "RFQResponse" ADD COLUMN "invitedAt" TIMESTAMP(3);
ALTER TABLE "RFQResponse" ADD COLUMN "respondedAt" TIMESTAMP(3);

-- Existing rows are real quotes, not invitations — mark when they came in.
UPDATE "RFQResponse" SET "respondedAt" = "createdAt" WHERE "respondedAt" IS NULL;

-- One row per supplier per RFQ. The service already enforced this, so this only trims
-- rows that predate that guard; the most recently updated quote is the one kept.
DELETE FROM "RFQResponse" a
  USING "RFQResponse" b
  WHERE a."rfqId" = b."rfqId"
    AND a."supplierId" = b."supplierId"
    AND (a."updatedAt", a."id") < (b."updatedAt", b."id");

CREATE UNIQUE INDEX "RFQResponse_token_key" ON "RFQResponse"("token");
CREATE UNIQUE INDEX "RFQResponse_rfqId_supplierId_key" ON "RFQResponse"("rfqId", "supplierId");
