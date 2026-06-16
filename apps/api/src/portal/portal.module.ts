import { Module } from '@nestjs/common';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, NotificationsModule, PaymentsModule, SalesModule],
  providers: [PortalService],
  controllers: [PortalController],
})
export class PortalModule {}
