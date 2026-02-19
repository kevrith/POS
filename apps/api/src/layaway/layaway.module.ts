import { Module } from '@nestjs/common';
import { LayawayService } from './layaway.service';
import { LayawayController } from './layaway.controller';

@Module({
  providers: [LayawayService],
  controllers: [LayawayController],
  exports: [LayawayService],
})
export class LayawayModule {}
