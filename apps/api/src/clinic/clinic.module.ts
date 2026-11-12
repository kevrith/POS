import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesModule } from '../sales/sales.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [PrismaModule, SalesModule],
  providers: [VisitsService],
  controllers: [VisitsController],
  exports: [VisitsService],
})
export class ClinicModule {}
