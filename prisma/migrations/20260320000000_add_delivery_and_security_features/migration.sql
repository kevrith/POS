-- Add delivery zones and enhanced delivery features
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinates" TEXT NOT NULL, -- JSON array of lat/lng points defining the zone
    "basePriceCents" INTEGER NOT NULL DEFAULT 0,
    "pricePerKm" INTEGER NOT NULL DEFAULT 0,
    "maxDistanceKm" REAL NOT NULL DEFAULT 10,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add driver location tracking
CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "driverId" TEXT NOT NULL,
    "deliveryOrderId" TEXT,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "heading" REAL,
    "speed" REAL,
    "accuracy" REAL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add delivery SLA tracking
CREATE TABLE "DeliverySLA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "promisedAt" DATETIME NOT NULL,
    "actualDeliveredAt" DATETIME,
    "isOnTime" BOOLEAN,
    "delayMinutes" INTEGER DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add third-party courier integrations
CREATE TABLE "CourierIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL, -- GLOVO | SENDY | UBER | BOLT
    "apiKey" TEXT,
    "webhookUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "config" TEXT, -- JSON config for provider-specific settings
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add custom roles and permissions
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL, -- JSON array of permission strings
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add permission matrix
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- Add role permissions junction table
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add tax configuration for zero-rated items
CREATE TABLE "TaxConfiguration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT,
    "category" TEXT,
    "vatRate" REAL NOT NULL DEFAULT 16.0,
    "totRate" REAL NOT NULL DEFAULT 3.0,
    "isZeroRated" BOOLEAN NOT NULL DEFAULT false,
    "exemptionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add password policy
CREATE TABLE "PasswordPolicy" (
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
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add user password history
CREATE TABLE "UserPasswordHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Enhance existing DeliveryOrder table
ALTER TABLE "DeliveryOrder" ADD COLUMN "zoneId" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "courierProvider" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "courierOrderId" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "trackingUrl" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "estimatedDeliveryAt" DATETIME;
ALTER TABLE "DeliveryOrder" ADD COLUMN "failedAttempts" INTEGER DEFAULT 0;
ALTER TABLE "DeliveryOrder" ADD COLUMN "rescheduleReason" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "rescheduledAt" DATETIME;

-- Enhance User table for password policy
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "passwordExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN DEFAULT false;

-- Add Business settings for eTIMS and security
ALTER TABLE "Business" ADD COLUMN "etimsMode" TEXT DEFAULT 'SANDBOX'; -- SANDBOX | PRODUCTION
ALTER TABLE "Business" ADD COLUMN "etimsProductionOnboarded" BOOLEAN DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "kraItaxIntegrationEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "Business" ADD COLUMN "kraItaxCredentials" TEXT; -- Encrypted iTax credentials

-- Create indexes
CREATE INDEX "DeliveryZone_businessId_idx" ON "DeliveryZone"("businessId");
CREATE INDEX "DriverLocation_driverId_timestamp_idx" ON "DriverLocation"("driverId", "timestamp");
CREATE INDEX "DriverLocation_deliveryOrderId_idx" ON "DriverLocation"("deliveryOrderId");
CREATE INDEX "DeliverySLA_businessId_idx" ON "DeliverySLA"("businessId");
CREATE INDEX "DeliverySLA_deliveryOrderId_idx" ON "DeliverySLA"("deliveryOrderId");
CREATE INDEX "CourierIntegration_businessId_provider_idx" ON "CourierIntegration"("businessId", "provider");
CREATE INDEX "CustomRole_businessId_idx" ON "CustomRole"("businessId");
CREATE INDEX "Permission_category_idx" ON "Permission"("category");
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");
CREATE INDEX "TaxConfiguration_businessId_idx" ON "TaxConfiguration"("businessId");
CREATE INDEX "TaxConfiguration_itemId_idx" ON "TaxConfiguration"("itemId");
CREATE INDEX "PasswordPolicy_businessId_idx" ON "PasswordPolicy"("businessId");
CREATE INDEX "UserPasswordHistory_userId_idx" ON "UserPasswordHistory"("userId");

-- Insert default permissions
INSERT INTO "Permission" ("id", "name", "category", "description", "endpoint", "method") VALUES
('perm_sales_create', 'Create Sales', 'Sales', 'Create new sales transactions', '/sales', 'POST'),
('perm_sales_view', 'View Sales', 'Sales', 'View sales history and details', '/sales', 'GET'),
('perm_sales_void', 'Void Sales', 'Sales', 'Void existing sales', '/sales/:id/void', 'POST'),
('perm_inventory_view', 'View Inventory', 'Inventory', 'View inventory levels and items', '/inventory', 'GET'),
('perm_inventory_adjust', 'Adjust Inventory', 'Inventory', 'Adjust inventory levels', '/inventory/adjust', 'POST'),
('perm_reports_view', 'View Reports', 'Reports', 'Access business reports', '/reports', 'GET'),
('perm_users_manage', 'Manage Users', 'Users', 'Create and manage user accounts', '/users', 'POST'),
('perm_settings_manage', 'Manage Settings', 'Settings', 'Modify business settings', '/settings', 'PUT'),
('perm_delivery_manage', 'Manage Deliveries', 'Delivery', 'Create and manage delivery orders', '/delivery', 'POST'),
('perm_audit_view', 'View Audit Logs', 'Security', 'Access audit trail', '/audit', 'GET');