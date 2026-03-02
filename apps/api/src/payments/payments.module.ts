import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { MpesaService } from './mpesa.service';
import { ReconciliationService } from './reconciliation.service';
import { PaymentsController } from './payments.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } })],
  providers: [MpesaService, ReconciliationService],
  controllers: [PaymentsController],
  exports: [MpesaService, ReconciliationService],
})
export class PaymentsModule {}
