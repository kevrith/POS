import { Module } from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { PaymentsController } from './payments.controller';

@Module({
  providers: [MpesaService],
  controllers: [PaymentsController],
  exports: [MpesaService],
})
export class PaymentsModule {}
