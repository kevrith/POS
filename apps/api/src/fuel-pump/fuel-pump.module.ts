import { Module } from '@nestjs/common';
import { FuelPumpController } from './fuel-pump.controller';
import { FuelPumpService } from './fuel-pump.service';
import { FuelPumpGateway } from './fuel-pump.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { SalesModule } from '../sales/sales.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [PrismaModule, SalesModule, LedgerModule],
  controllers: [FuelPumpController],
  providers: [FuelPumpService, FuelPumpGateway],
})
export class FuelPumpModule {}
