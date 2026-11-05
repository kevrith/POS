import { Module } from '@nestjs/common';
import { HospitalityController } from './hospitality.controller';
import { HospitalityService } from './hospitality.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsModule } from '../events/events.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [NotificationsModule, EventsModule, LedgerModule, SalesModule],
  controllers: [HospitalityController],
  providers: [HospitalityService, PrismaService],
  exports: [HospitalityService],
})
export class HospitalityModule {}
