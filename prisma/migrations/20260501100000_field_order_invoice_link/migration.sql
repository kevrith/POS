-- Add invoice tracking fields to FieldOrder
ALTER TABLE "FieldOrder" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "FieldOrder" ADD COLUMN "invoicedAt" TIMESTAMP(3);
