import { Module } from '@nestjs/common';
import { RFQService } from './rfq.service';
import { RFQController, PublicRFQQuoteController } from './rfq.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RFQController, PublicRFQQuoteController],
  providers: [RFQService],
})
export class RFQModule {}
