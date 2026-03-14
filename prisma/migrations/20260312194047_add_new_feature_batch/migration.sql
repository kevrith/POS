-- AlterTable
ALTER TABLE "Employee" ADD COLUMN "contractEndDate" DATETIME;
ALTER TABLE "Employee" ADD COLUMN "contractType" TEXT DEFAULT 'PERMANENT';

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "variantId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "course" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "firedAt" DATETIME;

-- CreateTable
CREATE TABLE "DamagedGoodsRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "variantId" TEXT,
    "quantity" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "authorizedBy" TEXT,
    "submittedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DamagedGoodsRecord_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "partySize" INTEGER NOT NULL,
    "notes" TEXT,
    "estimatedWaitMinutes" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "notifiedAt" DATETIME,
    "seatedAt" DATETIME,
    "tableId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "roomNumber" TEXT,
    "checkInDate" DATETIME NOT NULL,
    "checkOutDate" DATETIME NOT NULL,
    "nightCount" INTEGER NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "rawPayload" TEXT,
    "roomBookingId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HousekeepingAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "task" TEXT NOT NULL DEFAULT 'CLEAN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HousekeepingAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "HotelRoom" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HousekeepingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisciplinaryRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "incidentDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "actionTaken" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "employeeAck" BOOLEAN NOT NULL DEFAULT false,
    "ackDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DisciplinaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupplierPriceAgreement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "agreedPriceCents" INTEGER NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierPriceAgreement_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RFQ" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqNumber" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "deadline" DATETIME,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RFQItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityNeeded" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RFQItem_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RFQResponse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quotedPriceCents" INTEGER NOT NULL,
    "deliveryDays" INTEGER,
    "validUntil" DATETIME,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RFQResponse_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "RFQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RFQResponse_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseApprovalStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "actionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseApprovalStep_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChequePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "saleId" TEXT,
    "supplierId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RECEIVED',
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "drawerName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "clearanceDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "entryNumber" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "sourceType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedBy" TEXT,
    "postedAt" DATETIME,
    "reversalOf" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "debitCents" INTEGER NOT NULL DEFAULT 0,
    "creditCents" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CashDrawerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openingBalanceCents" INTEGER NOT NULL,
    "closingBalanceCents" INTEGER,
    "expectedBalanceCents" INTEGER,
    "varianceCents" INTEGER,
    "notes" TEXT,
    "tillNumber" INTEGER NOT NULL DEFAULT 1,
    "tillLabel" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CashDrawerSession" ("businessId", "cashierId", "closedAt", "closingBalanceCents", "createdAt", "expectedBalanceCents", "id", "notes", "openedAt", "openingBalanceCents", "status", "storeId", "updatedAt", "varianceCents") SELECT "businessId", "cashierId", "closedAt", "closingBalanceCents", "createdAt", "expectedBalanceCents", "id", "notes", "openedAt", "openingBalanceCents", "status", "storeId", "updatedAt", "varianceCents" FROM "CashDrawerSession";
DROP TABLE "CashDrawerSession";
ALTER TABLE "new_CashDrawerSession" RENAME TO "CashDrawerSession";
CREATE INDEX "CashDrawerSession_businessId_storeId_cashierId_idx" ON "CashDrawerSession"("businessId", "storeId", "cashierId");
CREATE INDEX "CashDrawerSession_status_idx" ON "CashDrawerSession"("status");
CREATE INDEX "CashDrawerSession_businessId_storeId_tillNumber_idx" ON "CashDrawerSession"("businessId", "storeId", "tillNumber");
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "creditLimitCents" INTEGER NOT NULL DEFAULT 0,
    "creditLimitPendingCents" INTEGER NOT NULL DEFAULT 0,
    "creditApprovalStatus" TEXT NOT NULL DEFAULT 'NONE',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Customer" ("balanceCents", "businessId", "createdAt", "creditLimitCents", "email", "id", "loyaltyPoints", "name", "phone", "updatedAt") SELECT "balanceCents", "businessId", "createdAt", "creditLimitCents", "email", "id", "loyaltyPoints", "name", "phone", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE INDEX "Customer_businessId_idx" ON "Customer"("businessId");
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "paidBy" TEXT NOT NULL,
    "receiptPhotoUrl" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDay" INTEGER,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "approvedBy" TEXT,
    "submittedBy" TEXT NOT NULL,
    "cashDrawerSessionId" TEXT,
    "vatReclaimable" BOOLEAN NOT NULL DEFAULT false,
    "vatAmountCents" INTEGER NOT NULL DEFAULT 0,
    "currentApprovalLevel" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Expense" ("amountCents", "approvalStatus", "approvedBy", "businessId", "cashDrawerSessionId", "category", "createdAt", "deletedAt", "description", "id", "isRecurring", "offlineId", "paidBy", "receiptPhotoUrl", "recurringDay", "storeId", "submittedBy", "updatedAt") SELECT "amountCents", "approvalStatus", "approvedBy", "businessId", "cashDrawerSessionId", "category", "createdAt", "deletedAt", "description", "id", "isRecurring", "offlineId", "paidBy", "receiptPhotoUrl", "recurringDay", "storeId", "submittedBy", "updatedAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_offlineId_key" ON "Expense"("offlineId");
CREATE INDEX "Expense_businessId_category_createdAt_idx" ON "Expense"("businessId", "category", "createdAt");
CREATE INDEX "Expense_approvalStatus_idx" ON "Expense"("approvalStatus");
CREATE TABLE "new_GRN" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freightCents" INTEGER NOT NULL DEFAULT 0,
    "dutyPaidCents" INTEGER NOT NULL DEFAULT 0,
    "landedCostAllocated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GRN_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GRN" ("createdAt", "id", "poId", "receivedAt") SELECT "createdAt", "id", "poId", "receivedAt" FROM "GRN";
DROP TABLE "GRN";
ALTER TABLE "new_GRN" RENAME TO "GRN";
CREATE INDEX "GRN_poId_idx" ON "GRN"("poId");
CREATE TABLE "new_GRNItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grnId" TEXT NOT NULL,
    "poItemId" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "batchLotNumber" TEXT,
    "expiryDate" DATETIME,
    "landedCostCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GRNItem_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GRN" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GRNItem" ("batchLotNumber", "createdAt", "expiryDate", "grnId", "id", "poItemId", "quantityReceived") SELECT "batchLotNumber", "createdAt", "expiryDate", "grnId", "id", "poItemId", "quantityReceived" FROM "GRNItem";
DROP TABLE "GRNItem";
ALTER TABLE "new_GRNItem" RENAME TO "GRNItem";
CREATE INDEX "GRNItem_grnId_idx" ON "GRNItem"("grnId");
CREATE TABLE "new_Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offlineId" TEXT,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PRODUCT',
    "retailPriceCents" INTEGER NOT NULL,
    "wholesalePriceCents" INTEGER,
    "vipPriceCents" INTEGER,
    "costPriceCents" INTEGER,
    "trackStock" BOOLEAN NOT NULL DEFAULT true,
    "trackSerials" BOOLEAN NOT NULL DEFAULT false,
    "trackBatches" BOOLEAN NOT NULL DEFAULT false,
    "trackExpiry" BOOLEAN NOT NULL DEFAULT false,
    "defaultExpiryDays" INTEGER,
    "negativeStockPolicy" TEXT,
    "weightUnit" TEXT,
    "reorderLevel" INTEGER DEFAULT 0,
    "vatApplicable" BOOLEAN NOT NULL DEFAULT true,
    "totApplicable" BOOLEAN NOT NULL DEFAULT false,
    "barcode" TEXT,
    "category" TEXT,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "minAgeYears" INTEGER NOT NULL DEFAULT 18,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 5,
    "unitWeightGrams" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageUrl" TEXT,
    "allergens" TEXT NOT NULL DEFAULT '[]',
    "reorderQty" INTEGER NOT NULL DEFAULT 1,
    "tareWeightGrams" INTEGER,
    "binLocation" TEXT,
    "isWeighed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Item_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Item" ("ageRestricted", "allergens", "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "imageUrl", "isActive", "minAgeYears", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "reorderQty", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents") SELECT "ageRestricted", "allergens", "barcode", "businessId", "category", "costPriceCents", "createdAt", "defaultExpiryDays", "deletedAt", "id", "imageUrl", "isActive", "minAgeYears", "name", "negativeStockPolicy", "offlineId", "prepTimeMinutes", "reorderLevel", "reorderQty", "retailPriceCents", "storeId", "totApplicable", "trackBatches", "trackExpiry", "trackSerials", "trackStock", "type", "unitWeightGrams", "updatedAt", "vatApplicable", "vipPriceCents", "weightUnit", "wholesalePriceCents" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_offlineId_key" ON "Item"("offlineId");
CREATE INDEX "Item_businessId_storeId_idx" ON "Item"("businessId", "storeId");
CREATE INDEX "Item_type_idx" ON "Item"("type");
CREATE INDEX "Item_barcode_idx" ON "Item"("barcode");
CREATE INDEX "Item_offlineId_idx" ON "Item"("offlineId");
CREATE TABLE "new_ItemVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "barcode" TEXT,
    "retailPriceCents" INTEGER NOT NULL,
    "wholesalePriceCents" INTEGER,
    "vipPriceCents" INTEGER,
    "costPriceCents" INTEGER,
    "attributes" TEXT NOT NULL,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItemVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ItemVariant" ("attributes", "barcode", "costPriceCents", "createdAt", "id", "itemId", "name", "retailPriceCents", "sku", "updatedAt", "vipPriceCents", "wholesalePriceCents") SELECT "attributes", "barcode", "costPriceCents", "createdAt", "id", "itemId", "name", "retailPriceCents", "sku", "updatedAt", "vipPriceCents", "wholesalePriceCents" FROM "ItemVariant";
DROP TABLE "ItemVariant";
ALTER TABLE "new_ItemVariant" RENAME TO "ItemVariant";
CREATE UNIQUE INDEX "ItemVariant_sku_key" ON "ItemVariant"("sku");
CREATE UNIQUE INDEX "ItemVariant_barcode_key" ON "ItemVariant"("barcode");
CREATE INDEX "ItemVariant_itemId_idx" ON "ItemVariant"("itemId");
CREATE INDEX "ItemVariant_barcode_idx" ON "ItemVariant"("barcode");
CREATE INDEX "ItemVariant_sku_idx" ON "ItemVariant"("sku");
CREATE TABLE "new_TableReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "partySize" INTEGER NOT NULL,
    "reservationTime" DATETIME NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 120,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "depositMethod" TEXT,
    "depositReference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TableReservation_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TableReservation" ("createdAt", "customerName", "customerPhone", "duration", "id", "notes", "partySize", "reservationTime", "status", "tableId", "updatedAt") SELECT "createdAt", "customerName", "customerPhone", "duration", "id", "notes", "partySize", "reservationTime", "status", "tableId", "updatedAt" FROM "TableReservation";
DROP TABLE "TableReservation";
ALTER TABLE "new_TableReservation" RENAME TO "TableReservation";
CREATE INDEX "TableReservation_tableId_reservationTime_idx" ON "TableReservation"("tableId", "reservationTime");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DamagedGoodsRecord_businessId_storeId_createdAt_idx" ON "DamagedGoodsRecord"("businessId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "DamagedGoodsRecord_status_idx" ON "DamagedGoodsRecord"("status");

-- CreateIndex
CREATE INDEX "Waitlist_businessId_storeId_status_idx" ON "Waitlist"("businessId", "storeId", "status");

-- CreateIndex
CREATE INDEX "Waitlist_createdAt_idx" ON "Waitlist"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelBooking_roomBookingId_key" ON "ChannelBooking"("roomBookingId");

-- CreateIndex
CREATE INDEX "ChannelBooking_businessId_status_idx" ON "ChannelBooking"("businessId", "status");

-- CreateIndex
CREATE INDEX "ChannelBooking_checkInDate_idx" ON "ChannelBooking"("checkInDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelBooking_businessId_channel_externalId_key" ON "ChannelBooking"("businessId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "HousekeepingAssignment_businessId_status_idx" ON "HousekeepingAssignment"("businessId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingAssignment_roomId_idx" ON "HousekeepingAssignment"("roomId");

-- CreateIndex
CREATE INDEX "HousekeepingAssignment_employeeId_idx" ON "HousekeepingAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_businessId_employeeId_idx" ON "DisciplinaryRecord"("businessId", "employeeId");

-- CreateIndex
CREATE INDEX "DisciplinaryRecord_createdAt_idx" ON "DisciplinaryRecord"("createdAt");

-- CreateIndex
CREATE INDEX "SupplierPriceAgreement_businessId_supplierId_idx" ON "SupplierPriceAgreement"("businessId", "supplierId");

-- CreateIndex
CREATE INDEX "SupplierPriceAgreement_itemId_isActive_idx" ON "SupplierPriceAgreement"("itemId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RFQ_rfqNumber_key" ON "RFQ"("rfqNumber");

-- CreateIndex
CREATE INDEX "RFQ_businessId_status_idx" ON "RFQ"("businessId", "status");

-- CreateIndex
CREATE INDEX "RFQItem_rfqId_idx" ON "RFQItem"("rfqId");

-- CreateIndex
CREATE INDEX "RFQResponse_rfqId_idx" ON "RFQResponse"("rfqId");

-- CreateIndex
CREATE INDEX "RFQResponse_supplierId_idx" ON "RFQResponse"("supplierId");

-- CreateIndex
CREATE INDEX "ExpenseApprovalStep_expenseId_level_idx" ON "ExpenseApprovalStep"("expenseId", "level");

-- CreateIndex
CREATE INDEX "ChequePayment_businessId_status_idx" ON "ChequePayment"("businessId", "status");

-- CreateIndex
CREATE INDEX "ChequePayment_chequeNumber_idx" ON "ChequePayment"("chequeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_date_idx" ON "JournalEntry"("businessId", "date");

-- CreateIndex
CREATE INDEX "JournalEntry_status_idx" ON "JournalEntry"("status");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountCode_idx" ON "JournalLine"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentLink_code_key" ON "PaymentLink"("code");

-- CreateIndex
CREATE INDEX "PaymentLink_businessId_status_idx" ON "PaymentLink"("businessId", "status");

-- CreateIndex
CREATE INDEX "PaymentLink_code_idx" ON "PaymentLink"("code");
