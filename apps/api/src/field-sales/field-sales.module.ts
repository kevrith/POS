import { Module } from '@nestjs/common';
import { FieldSalesController } from './field-sales.controller';
import { FieldSalesService } from './field-sales.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FieldSalesController],
  providers: [FieldSalesService],
  exports: [FieldSalesService],
})
export class FieldSalesModule {}
