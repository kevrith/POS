-- A completed appointment becomes a real sale once a business is on the sales pipeline, and keeps the sale it was
-- invoiced as. Deposits taken for appointments use the existing CashMovement register (reasons APPOINTMENT_DEPOSIT*).
--
-- No existing row changes.

ALTER TABLE "Appointment" ADD COLUMN "saleId" TEXT;
