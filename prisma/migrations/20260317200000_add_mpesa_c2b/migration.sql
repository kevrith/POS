-- CreateTable
CREATE TABLE "MpesaC2BTransaction" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "billRefNumber" TEXT NOT NULL DEFAULT '',
    "orgAccountBalance" INTEGER,
    "shortCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "saleId" TEXT,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MpesaC2BTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MpesaC2BTransaction_transactionId_key" ON "MpesaC2BTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "MpesaC2BTransaction_businessId_status_idx" ON "MpesaC2BTransaction"("businessId", "status");

-- CreateIndex
CREATE INDEX "MpesaC2BTransaction_createdAt_idx" ON "MpesaC2BTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "MpesaC2BTransaction" ADD CONSTRAINT "MpesaC2BTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
