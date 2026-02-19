import { Module } from '@nestjs/common';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [HrController],
  providers: [HrService, PrismaService],
  exports: [HrService],
})
export class HrModule {}
