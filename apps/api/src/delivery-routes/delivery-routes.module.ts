import { Module } from '@nestjs/common';
import { DeliveryRoutesController } from './delivery-routes.controller';
import { DeliveryRoutesService } from './delivery-routes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryModule } from '../delivery/delivery.module';

@Module({
  imports: [PrismaModule, DeliveryModule],
  controllers: [DeliveryRoutesController],
  providers: [DeliveryRoutesService],
  exports: [DeliveryRoutesService],
})
export class DeliveryRoutesModule {}
