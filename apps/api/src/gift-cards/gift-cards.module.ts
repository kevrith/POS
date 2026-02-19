import { Module } from '@nestjs/common';
import { GiftCardsController } from './gift-cards.controller';
import { GiftCardsService } from './gift-cards.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [GiftCardsController],
  providers: [GiftCardsService, PrismaService],
  exports: [GiftCardsService],
})
export class GiftCardsModule {}
