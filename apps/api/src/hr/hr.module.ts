import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [HrController],
  providers: [HrService, PayrollService, PrismaService],
  exports: [HrService, PayrollService],
})
export class HrModule {}
