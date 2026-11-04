import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrintersModule } from '../printers/printers.module';
import { PrintJobsController } from './print-jobs.controller';
import { PrintJobsService } from './print-jobs.service';
import { PrintStationGuard } from './print-station.guard';
import { PrintBridgeController, PrintStationsController } from './print-stations.controller';
import { PrintStationsService } from './print-stations.service';

@Module({
  imports: [PrintersModule],
  controllers: [PrintJobsController, PrintStationsController, PrintBridgeController],
  providers: [PrintJobsService, PrintStationsService, PrintStationGuard, PrismaService],
  exports: [PrintJobsService],
})
export class PrintJobsModule {}
