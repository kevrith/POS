-- Fractional quantities on the sell / stock / receive / write-off path.
--
-- Loose goods (rice by the kilo, meat, cloth by the metre) are sold and stocked in fractions, but these
-- columns were INTEGER. Postgres rounded what it was given, so selling 0.5 kg stored a quantity of 0:
-- the stock ledger never went down, the sale line showed 0, and voiding that line refunded unit price x 0.
--
-- INTEGER -> DOUBLE PRECISION loses nothing (every existing value is representable). The columns are
-- widened together so a quantity means the same thing on every table it passes through: a sale line, the
-- ledger movement it creates, the batch it is drawn from, the GRN / PO / transfer / supplier return that
-- brought it in or sent it back, and the damaged-goods record an expiry write-off creates.
--
-- This rewrites each table once and holds a lock while it does. On a large InventoryMovement table run it
-- outside trading hours. Rows already damaged by the old rounding are NOT changed here; see
-- prisma/repairs/20261105_fractional_quantities.sql to review and repair them.

ALTER TABLE "SaleItem"           ALTER COLUMN "quantity"          TYPE DOUBLE PRECISION;
ALTER TABLE "InventoryMovement"  ALTER COLUMN "quantity"          TYPE DOUBLE PRECISION;
ALTER TABLE "Batch"              ALTER COLUMN "quantityReceived"  TYPE DOUBLE PRECISION;
ALTER TABLE "Batch"              ALTER COLUMN "quantityRemaining" TYPE DOUBLE PRECISION;
ALTER TABLE "DamagedGoodsRecord" ALTER COLUMN "quantity"          TYPE DOUBLE PRECISION;
ALTER TABLE "TransferItem"       ALTER COLUMN "quantity"          TYPE DOUBLE PRECISION;
ALTER TABLE "GRNItem"            ALTER COLUMN "quantityReceived"  TYPE DOUBLE PRECISION;
ALTER TABLE "POItem"             ALTER COLUMN "quantityOrdered"   TYPE DOUBLE PRECISION;
ALTER TABLE "SupplierReturnItem" ALTER COLUMN "quantity"          TYPE DOUBLE PRECISION;
