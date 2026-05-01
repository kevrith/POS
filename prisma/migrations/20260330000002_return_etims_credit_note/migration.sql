-- AlterTable
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "etimsCreditNoteSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "etimsCreditNoteRef" TEXT;
