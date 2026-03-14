-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT 'VAT',
    "serviceChargeRate" REAL NOT NULL DEFAULT 10,
    "negativePolicyDefault" TEXT NOT NULL DEFAULT 'BLOCK',
    "posMode" TEXT NOT NULL DEFAULT 'RETAIL',
    "expiredItemPolicy" TEXT NOT NULL DEFAULT 'BLOCK',
    "expenseApprovalThresholdCents" INTEGER DEFAULT 500000,
    "expiryAlertDays" INTEGER NOT NULL DEFAULT 30,
    "etimsCredentialsEncrypted" TEXT,
    "mpesaCredentialsEncrypted" TEXT,
    "atCredentialsEncrypted" TEXT,
    "etimsMode" TEXT NOT NULL DEFAULT 'SANDBOX',
    "etimsProductionOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "kraItaxIntegrationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "kraItaxCredentials" TEXT,
    "subscriptionTier" TEXT NOT NULL DEFAULT 'TRIAL',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" DATETIME,
    "planName" TEXT NOT NULL DEFAULT 'STARTER',
    "paystackCustomerId" TEXT,
    "paystackSubscriptionId" TEXT,
    "paystackPublicKey" TEXT,
    "referralCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "exchangeRates" TEXT,
    "displayCurrencies" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "bankAccountName" TEXT,
    "bankBranch" TEXT,
    "idleMessage" TEXT DEFAULT 'Welcome!',
    "idleLogoUrl" TEXT,
    "tablePrefix" TEXT DEFAULT 'T',
    "receiptHeader" TEXT,
    "receiptFooter" TEXT,
    "parentBusinessId" TEXT,
    "franchiseFee" REAL DEFAULT 0,
    "royaltyRate" REAL DEFAULT 0,
    CONSTRAINT "Business_parentBusinessId_fkey" FOREIGN KEY ("parentBusinessId") REFERENCES "Business" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("atCredentialsEncrypted", "bankAccountName", "bankAccountNumber", "bankBranch", "bankName", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", "etimsMode", "etimsProductionOnboarded", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "expiryAlertDays", "franchiseFee", "id", "idleLogoUrl", "idleMessage", "kraItaxCredentials", "kraItaxIntegrationEnabled", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "parentBusinessId", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "receiptFooter", "receiptHeader", "referralCode", "royaltyRate", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "tablePrefix", "taxType", "trialEndsAt", "updatedAt") SELECT "atCredentialsEncrypted", "bankAccountName", "bankAccountNumber", "bankBranch", "bankName", "createdAt", "displayCurrencies", "etimsCredentialsEncrypted", coalesce("etimsMode", 'SANDBOX') AS "etimsMode", coalesce("etimsProductionOnboarded", false) AS "etimsProductionOnboarded", "exchangeRates", "expenseApprovalThresholdCents", "expiredItemPolicy", "expiryAlertDays", "franchiseFee", "id", "idleLogoUrl", "idleMessage", "kraItaxCredentials", coalesce("kraItaxIntegrationEnabled", false) AS "kraItaxIntegrationEnabled", "mpesaCredentialsEncrypted", "name", "negativePolicyDefault", "parentBusinessId", "paystackCustomerId", "paystackPublicKey", "paystackSubscriptionId", "planName", "posMode", "receiptFooter", "receiptHeader", "referralCode", "royaltyRate", "serviceChargeRate", "subscriptionStatus", "subscriptionTier", "tablePrefix", "taxType", "trialEndsAt", "updatedAt" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
CREATE UNIQUE INDEX "Business_referralCode_key" ON "Business"("referralCode");
CREATE INDEX "Business_subscriptionStatus_idx" ON "Business"("subscriptionStatus");
CREATE INDEX "Business_referralCode_idx" ON "Business"("referralCode");
CREATE TABLE "new_CourierIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CourierIntegration" ("apiKey", "businessId", "config", "createdAt", "id", "isActive", "provider", "updatedAt", "webhookUrl") SELECT "apiKey", "businessId", "config", "createdAt", "id", "isActive", "provider", "updatedAt", "webhookUrl" FROM "CourierIntegration";
DROP TABLE "CourierIntegration";
ALTER TABLE "new_CourierIntegration" RENAME TO "CourierIntegration";
CREATE INDEX "CourierIntegration_businessId_provider_idx" ON "CourierIntegration"("businessId", "provider");
CREATE TABLE "new_CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CustomRole" ("businessId", "createdAt", "description", "id", "isActive", "name", "permissions", "updatedAt") SELECT "businessId", "createdAt", "description", "id", "isActive", "name", "permissions", "updatedAt" FROM "CustomRole";
DROP TABLE "CustomRole";
ALTER TABLE "new_CustomRole" RENAME TO "CustomRole";
CREATE INDEX "CustomRole_businessId_idx" ON "CustomRole"("businessId");
CREATE TABLE "new_DeliveryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "saleId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "deliveryAddress" TEXT NOT NULL,
    "zoneId" TEXT,
    "courierProvider" TEXT,
    "courierOrderId" TEXT,
    "trackingUrl" TEXT,
    "estimatedDeliveryAt" DATETIME,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "rescheduleReason" TEXT,
    "rescheduledAt" DATETIME,
    "driverId" TEXT,
    "scheduledAt" DATETIME,
    "pickedUpAt" DATETIME,
    "deliveredAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "lat" REAL,
    "lng" REAL,
    "proofPhotoUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryOrder" ("businessId", "courierOrderId", "courierProvider", "createdAt", "customerId", "customerName", "customerPhone", "deliveredAt", "deliveryAddress", "deliveryFeeCents", "driverId", "estimatedDeliveryAt", "failedAttempts", "id", "lat", "lng", "notes", "orderNumber", "pickedUpAt", "proofPhotoUrl", "rescheduleReason", "rescheduledAt", "saleId", "scheduledAt", "status", "storeId", "trackingUrl", "updatedAt", "zoneId") SELECT "businessId", "courierOrderId", "courierProvider", "createdAt", "customerId", "customerName", "customerPhone", "deliveredAt", "deliveryAddress", "deliveryFeeCents", "driverId", "estimatedDeliveryAt", coalesce("failedAttempts", 0) AS "failedAttempts", "id", "lat", "lng", "notes", "orderNumber", "pickedUpAt", "proofPhotoUrl", "rescheduleReason", "rescheduledAt", "saleId", "scheduledAt", "status", "storeId", "trackingUrl", "updatedAt", "zoneId" FROM "DeliveryOrder";
DROP TABLE "DeliveryOrder";
ALTER TABLE "new_DeliveryOrder" RENAME TO "DeliveryOrder";
CREATE UNIQUE INDEX "DeliveryOrder_orderNumber_key" ON "DeliveryOrder"("orderNumber");
CREATE INDEX "DeliveryOrder_businessId_storeId_status_idx" ON "DeliveryOrder"("businessId", "storeId", "status");
CREATE TABLE "new_DeliverySLA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "promisedAt" DATETIME NOT NULL,
    "actualDeliveredAt" DATETIME,
    "isOnTime" BOOLEAN,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_DeliverySLA" ("actualDeliveredAt", "businessId", "createdAt", "delayMinutes", "deliveryOrderId", "id", "isOnTime", "promisedAt") SELECT "actualDeliveredAt", "businessId", "createdAt", coalesce("delayMinutes", 0) AS "delayMinutes", "deliveryOrderId", "id", "isOnTime", "promisedAt" FROM "DeliverySLA";
DROP TABLE "DeliverySLA";
ALTER TABLE "new_DeliverySLA" RENAME TO "DeliverySLA";
CREATE INDEX "DeliverySLA_businessId_idx" ON "DeliverySLA"("businessId");
CREATE INDEX "DeliverySLA_deliveryOrderId_idx" ON "DeliverySLA"("deliveryOrderId");
CREATE TABLE "new_DeliveryZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinates" TEXT NOT NULL,
    "basePriceCents" INTEGER NOT NULL DEFAULT 0,
    "pricePerKm" INTEGER NOT NULL DEFAULT 0,
    "maxDistanceKm" REAL NOT NULL DEFAULT 10,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DeliveryZone" ("basePriceCents", "businessId", "coordinates", "createdAt", "estimatedMinutes", "id", "isActive", "maxDistanceKm", "name", "pricePerKm", "updatedAt") SELECT "basePriceCents", "businessId", "coordinates", "createdAt", "estimatedMinutes", "id", "isActive", "maxDistanceKm", "name", "pricePerKm", "updatedAt" FROM "DeliveryZone";
DROP TABLE "DeliveryZone";
ALTER TABLE "new_DeliveryZone" RENAME TO "DeliveryZone";
CREATE INDEX "DeliveryZone_businessId_idx" ON "DeliveryZone"("businessId");
CREATE TABLE "new_PasswordPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "minLength" INTEGER NOT NULL DEFAULT 8,
    "requireUppercase" BOOLEAN NOT NULL DEFAULT true,
    "requireLowercase" BOOLEAN NOT NULL DEFAULT true,
    "requireNumbers" BOOLEAN NOT NULL DEFAULT true,
    "requireSpecialChars" BOOLEAN NOT NULL DEFAULT false,
    "rotationDays" INTEGER NOT NULL DEFAULT 90,
    "preventReuse" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PasswordPolicy" ("businessId", "createdAt", "id", "isActive", "minLength", "preventReuse", "requireLowercase", "requireNumbers", "requireSpecialChars", "requireUppercase", "rotationDays", "updatedAt") SELECT "businessId", "createdAt", "id", "isActive", "minLength", "preventReuse", "requireLowercase", "requireNumbers", "requireSpecialChars", "requireUppercase", "rotationDays", "updatedAt" FROM "PasswordPolicy";
DROP TABLE "PasswordPolicy";
ALTER TABLE "new_PasswordPolicy" RENAME TO "PasswordPolicy";
CREATE INDEX "PasswordPolicy_businessId_idx" ON "PasswordPolicy"("businessId");
CREATE TABLE "new_RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CustomRole" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RolePermission" ("createdAt", "granted", "id", "permissionId", "roleId") SELECT "createdAt", "granted", "id", "permissionId", "roleId" FROM "RolePermission";
DROP TABLE "RolePermission";
ALTER TABLE "new_RolePermission" RENAME TO "RolePermission";
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");
CREATE TABLE "new_TaxConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT,
    "category" TEXT,
    "vatRate" REAL NOT NULL DEFAULT 16.0,
    "totRate" REAL NOT NULL DEFAULT 3.0,
    "isZeroRated" BOOLEAN NOT NULL DEFAULT false,
    "exemptionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TaxConfiguration" ("businessId", "category", "createdAt", "exemptionReason", "id", "isZeroRated", "itemId", "totRate", "updatedAt", "vatRate") SELECT "businessId", "category", "createdAt", "exemptionReason", "id", "isZeroRated", "itemId", "totRate", "updatedAt", "vatRate" FROM "TaxConfiguration";
DROP TABLE "TaxConfiguration";
ALTER TABLE "new_TaxConfiguration" RENAME TO "TaxConfiguration";
CREATE INDEX "TaxConfiguration_businessId_idx" ON "TaxConfiguration"("businessId");
CREATE INDEX "TaxConfiguration_itemId_idx" ON "TaxConfiguration"("itemId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pin" TEXT,
    "pinHash" TEXT,
    "totpSecret" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "deviceToken" TEXT,
    "phone" TEXT,
    "passwordChangedAt" DATETIME,
    "passwordExpiresAt" DATETIME,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "businessId", "createdAt", "deviceToken", "email", "googleId", "id", "lockedUntil", "loginAttempts", "mustChangePassword", "name", "passwordChangedAt", "passwordExpiresAt", "passwordHash", "phone", "pin", "pinHash", "role", "totpSecret", "updatedAt") SELECT "avatarUrl", "businessId", "createdAt", "deviceToken", "email", "googleId", "id", "lockedUntil", "loginAttempts", coalesce("mustChangePassword", false) AS "mustChangePassword", "name", "passwordChangedAt", "passwordExpiresAt", "passwordHash", "phone", "pin", "pinHash", "role", "totpSecret", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
CREATE INDEX "User_businessId_role_idx" ON "User"("businessId", "role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
