import { Module } from '@nestjs/common';
import { LayawayService } from './layaway.service';
import { LayawayController } from './layaway.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [LayawayService],
  controllers: [LayawayController],
  exports: [LayawayService],
})
export class LayawayModule {}
