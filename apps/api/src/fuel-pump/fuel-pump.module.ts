import { Module } from '@nestjs/common';
import { FuelPumpController } from './fuel-pump.controller';
import { FuelPumpService } from './fuel-pump.service';
import { FuelPumpGateway } from './fuel-pump.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FuelPumpController],
  providers: [FuelPumpService, FuelPumpGateway],
})
export class FuelPumpModule {}
