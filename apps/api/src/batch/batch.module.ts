import { Module } from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchController } from './batch.controller';
import { BatchExpiryCronService } from './batch-expiry-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [BatchService, BatchExpiryCronService],
  controllers: [BatchController],
  exports: [BatchService, BatchExpiryCronService],
})
export class BatchModule {}
