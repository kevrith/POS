import { Module } from '@nestjs/common';
import { DamagedGoodsService } from './damaged-goods.service';
import { DamagedGoodsController } from './damaged-goods.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DamagedGoodsController],
  providers: [DamagedGoodsService],
})
export class DamagedGoodsModule {}
