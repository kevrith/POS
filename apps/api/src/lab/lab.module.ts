import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LabController } from './lab.controller';
import { LabService } from './lab.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [LabService],
  controllers: [LabController],
  exports: [LabService],
})
export class LabModule {}
