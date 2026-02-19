import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TransfersController],
  providers: [TransfersService, PrismaService],
  exports: [TransfersService],
})
export class TransfersModule {}
