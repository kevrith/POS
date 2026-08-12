import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { EtimsModule } from '../etims/etims.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PrismaModule, InventoryModule, AuditModule, AuthModule, WebhooksModule, EtimsModule, NotificationsModule, EventsModule, LoyaltyModule, SubscriptionModule, LedgerModule],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
