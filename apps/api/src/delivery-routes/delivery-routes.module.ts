import { Module } from '@nestjs/common';
import { DeliveryRoutesController } from './delivery-routes.controller';
import { DeliveryRoutesService } from './delivery-routes.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryRoutesController],
  providers: [DeliveryRoutesService],
  exports: [DeliveryRoutesService],
})
export class DeliveryRoutesModule {}
