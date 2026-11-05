import { Module } from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { PrescriptionsController } from './prescriptions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [PrismaModule, SalesModule],
  providers: [PrescriptionsService],
  controllers: [PrescriptionsController],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
