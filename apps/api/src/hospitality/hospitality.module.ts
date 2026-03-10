import { Module } from '@nestjs/common';
import { HospitalityController } from './hospitality.controller';
import { HospitalityService } from './hospitality.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [HospitalityController],
  providers: [HospitalityService, PrismaService],
  exports: [HospitalityService],
})
export class HospitalityModule {}
