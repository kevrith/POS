import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoverModule } from '../cover/cover.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesModule } from '../sales/sales.module';
import { ClinicReportsController } from './clinic-reports.controller';
import { ClinicReportsService } from './clinic-reports.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [PrismaModule, SalesModule, CoverModule, NotificationsModule],
  providers: [VisitsService, ClinicReportsService],
  controllers: [VisitsController, ClinicReportsController],
  exports: [VisitsService],
})
export class ClinicModule {}
