import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  @Post('program')
  async createProgram(@Body() data: {
    businessId: string;
    name: string;
    pointsPerCent: number;
    redemptionRate: number;
    minRedemption: number;
  }) {
    return this.loyaltyService.createProgram(data);
  }

  @Get('program')
  async getProgram(@Query('businessId') businessId: string) {
    return this.loyaltyService.getProgram(businessId);
  }

  @Post('earn')
  async earnPoints(@Body() data: {
    customerId: string;
    saleCents: number;
    saleId: string;
  }) {
    return this.loyaltyService.earnPoints(data.customerId, data.saleCents, data.saleId);
  }

  @Post('redeem')
  async redeemPoints(@Body() data: {
    customerId: string;
    points: number;
    saleId: string;
  }) {
    return this.loyaltyService.redeemPoints(data.customerId, data.points, data.saleId);
  }

  @Get('customer/:id')
  async getCustomerPoints(@Param('id') id: string) {
    return this.loyaltyService.getCustomerPoints(id);
  }
}
