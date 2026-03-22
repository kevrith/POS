import { Module } from '@nestjs/common';
import { CybercafeController } from './cybercafe.controller';
import { CybercafeService } from './cybercafe.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, EventsModule],
  controllers: [CybercafeController],
  providers: [CybercafeService],
})
export class CybercafeModule {}
