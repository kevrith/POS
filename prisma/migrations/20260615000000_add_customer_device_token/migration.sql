-- Expo push token for the self-service customer app (order-status notifications)
ALTER TABLE "Customer" ADD COLUMN "deviceToken" TEXT;
