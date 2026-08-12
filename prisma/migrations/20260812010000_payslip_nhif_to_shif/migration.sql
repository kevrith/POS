-- NHIF was replaced by SHIF (Social Health Insurance Fund) on 1 October 2024 under the
-- Social Health Insurance Act 2023. Rename the column rather than adding a new one so
-- historical payslip amounts are preserved.
ALTER TABLE "Payslip" RENAME COLUMN "nhifAmount" TO "shifAmount";
