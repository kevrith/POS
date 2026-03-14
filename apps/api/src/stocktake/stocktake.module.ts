import { Module } from '@nestjs/common';
import { StocktakeService } from './stocktake.service';
import { StocktakeController } from './stocktake.controller';

@Module({
  controllers: [StocktakeController],
  providers: [StocktakeService],
})
export class StocktakeModule {}
