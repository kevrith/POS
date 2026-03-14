import { Module } from '@nestjs/common';
import { RFQService } from './rfq.service';
import { RFQController } from './rfq.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RFQController],
  providers: [RFQService],
})
export class RFQModule {}
