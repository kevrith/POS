-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN "lat" REAL;
ALTER TABLE "DeliveryOrder" ADD COLUMN "lng" REAL;
ALTER TABLE "DeliveryOrder" ADD COLUMN "proofPhotoUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "deviceToken" TEXT;
