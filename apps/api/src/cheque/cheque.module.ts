import { Module } from '@nestjs/common';
import { ChequeService } from './cheque.service';
import { ChequeController } from './cheque.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChequeController],
  providers: [ChequeService],
})
export class ChequeModule {}
