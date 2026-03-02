import { Module } from '@nestjs/common';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportSchedulesController } from './report-schedules.controller';
import { ReportCronService } from './report-cron.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PrismaModule, ReportsModule, EmailModule],
  controllers: [ReportSchedulesController],
  providers: [ReportSchedulesService, ReportCronService],
})
export class ReportSchedulesModule {}
