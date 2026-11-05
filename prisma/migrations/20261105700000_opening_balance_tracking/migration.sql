-- Opening balances that can be topped up when the sales pipeline is switched off and on again.
--
--   FleetAccount.ledgerOwedCents   what the books believe the account owes. Kept in step while the pipeline is on; on
--                                  switching on, the difference from what it really owes is booked.
--   InsuranceClaim.receivableBooked  a hand-raised claim whose amount an opening balance brought into receivables.
--
-- Existing accounts and claims start at 0 / false, so the next switch-on books everything they are owed once.

ALTER TABLE "FleetAccount" ADD COLUMN "ledgerOwedCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InsuranceClaim" ADD COLUMN "receivableBooked" BOOLEAN NOT NULL DEFAULT false;
