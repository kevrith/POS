-- The driver app's "My Earnings" summed DeliveryOrder.deliveryFeeCents — the fee
-- charged to the customer, which is business revenue, not what the driver is owed.
-- Nothing in the model described driver pay at all.
ALTER TABLE "User" ADD COLUMN "deliveryRateCents" INTEGER;
ALTER TABLE "User" ADD COLUMN "deliveryCommissionPercent" INTEGER;
