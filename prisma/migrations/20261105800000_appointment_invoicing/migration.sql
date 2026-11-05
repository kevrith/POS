-- A completed appointment becomes a real sale once a business is on the sales pipeline, and keeps the sale it was
-- invoiced as. Deposits taken for appointments use the existing CashMovement register (reasons APPOINTMENT_DEPOSIT*).
--
-- No existing row changes.
-- Safe to run again: every statement checks first, so a database where this was already applied by hand still deploys.

ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
