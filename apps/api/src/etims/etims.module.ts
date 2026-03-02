import { Module } from '@nestjs/common';
import { EtimsController } from './etims.controller';
import { EtimsService } from './etims.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EtimsController],
  providers: [EtimsService, PrismaService],
  exports: [EtimsService],
})
export class EtimsModule {}
