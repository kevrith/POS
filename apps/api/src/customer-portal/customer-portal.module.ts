import { Module } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { PortalAuthGuard } from './portal-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, PortalAuthGuard],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
