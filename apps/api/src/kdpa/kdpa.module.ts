import { Module } from '@nestjs/common';
import { KdpaController } from './kdpa.controller';
import { KdpaService } from './kdpa.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KdpaController],
  providers: [KdpaService],
})
export class KdpaModule {}
