import { Module } from '@nestjs/common';
import { CashDrawerController } from './cash-drawer.controller';
import { CashDrawerService } from './cash-drawer.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CashDrawerController],
  providers: [CashDrawerService, PrismaService],
  exports: [CashDrawerService],
})
export class CashDrawerModule {}
