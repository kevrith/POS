import { Module } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { PrintersController } from './printers.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PrintersController],
  providers: [PrintersService, PrismaService],
  exports: [PrintersService],
})
export class PrintersModule {}
