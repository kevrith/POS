import { Module } from '@nestjs/common';
import { FuelPumpController } from './fuel-pump.controller';
import { FuelPumpService } from './fuel-pump.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FuelPumpController],
  providers: [FuelPumpService],
})
export class FuelPumpModule {}
