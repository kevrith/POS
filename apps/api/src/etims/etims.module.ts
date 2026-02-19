import { Module } from '@nestjs/common';
import { EtimsController } from './etims.controller';
import { EtimsService } from './etims.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [EtimsController],
  providers: [EtimsService, PrismaService],
  exports: [EtimsService],
})
export class EtimsModule {}
