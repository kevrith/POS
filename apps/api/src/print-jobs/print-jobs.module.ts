import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrintersModule } from '../printers/printers.module';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';

@Module({
  imports: [PrintersModule],
  controllers: [PrintJobsController],
  providers: [PrintJobsService, PrismaService],
  exports: [PrintJobsService],
})
export class PrintJobsModule {}
