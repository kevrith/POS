import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { GiftCardsService } from './gift-cards.service';

@Controller('gift-cards')
export class GiftCardsController {
  constructor(private giftCardsService: GiftCardsService) {}

  @Post()
  async createGiftCard(@Body() data: {
    businessId: string;
    initialValueCents: number;
    purchasedBy?: string;
  }) {
    return this.giftCardsService.createGiftCard(data);
  }

  @Get(':code')
  async getGiftCard(@Param('code') code: string) {
    return this.giftCardsService.getGiftCard(code);
  }

  @Post(':code/redeem')
  async redeemGiftCard(
    @Param('code') code: string,
    @Body() data: { amountCents: number; saleId: string }
  ) {
    return this.giftCardsService.redeemGiftCard(code, data.amountCents, data.saleId);
  }

  @Post(':code/top-up')
  async topUpGiftCard(@Param('code') code: string, @Body('amountCents') amountCents: number) {
    return this.giftCardsService.topUpGiftCard(code, amountCents);
  }

  @Get()
  async getGiftCards(
    @Query('businessId') businessId: string,
    @Query('status') status?: string
  ) {
    return this.giftCardsService.getGiftCards(businessId, status);
  }
}
