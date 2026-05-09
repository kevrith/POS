-- Add receipt format preferences to Business model
ALTER TABLE "Business" ADD COLUMN "receiptFormatSale" TEXT DEFAULT 'THERMAL';
ALTER TABLE "Business" ADD COLUMN "receiptFormatInvoice" TEXT DEFAULT 'A4';
ALTER TABLE "Business" ADD COLUMN "receiptFormatDelivery" TEXT DEFAULT 'A4';
ALTER TABLE "Business" ADD COLUMN "receiptFormatEmail" TEXT DEFAULT 'A4';
