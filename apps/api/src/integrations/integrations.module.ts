import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { HotelService } from './hotel.service';
import { HotelController } from './hotel.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [IntegrationsController, AccountingController, HotelController],
  providers: [IntegrationsService, AccountingService, HotelService, PrismaService],
  exports: [IntegrationsService, AccountingService, HotelService],
})
export class IntegrationsModule {}
