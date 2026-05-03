import { Module } from '@nestjs/common';
import { DbBackupService } from './db-backup.service';

@Module({
  providers: [DbBackupService],
  exports: [DbBackupService],
})
export class DbBackupModule {}
