-- CreateTable
CREATE TABLE IF NOT EXISTS "SalaryAdvance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "rejectedBy" TEXT,
    "rejectionNote" TEXT,
    "deductedAt" TIMESTAMP(3),
    "payrollRunId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalaryAdvance_businessId_idx" ON "SalaryAdvance"("businessId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalaryAdvance_employeeId_idx" ON "SalaryAdvance"("employeeId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SalaryAdvance_employeeId_fkey') THEN
    ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
