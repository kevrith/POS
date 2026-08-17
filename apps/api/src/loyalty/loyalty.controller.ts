import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';

@RequiresFeature(Feature.LOYALTY_BASIC)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private loyaltyService: LoyaltyService) {}

  @Post('program')
  async createProgram(@Body() data: {
    businessId: string;
    name: string;
    kesPerPoint: number;
    pointValueCents: number;
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

  // ─── Tiers ─────────────────────────────────────────────────────────────────

  @Post('tiers')
  async createTier(@Body() data: {
    businessId: string;
    name: string;
    minPoints: number;
    multiplier: number;
    color: string;
    perksJson?: string;
  }) {
    return this.loyaltyService.createTier(data);
  }

  @Get('tiers')
  async getTiers(@Query('businessId') businessId: string) {
    return this.loyaltyService.getTiers(businessId);
  }

  @Patch('tiers/:id')
  async updateTier(@Param('id') id: string, @Body() data: Partial<{
    name: string;
    minPoints: number;
    multiplier: number;
    color: string;
    perksJson: string;
  }>) {
    return this.loyaltyService.updateTier(id, data);
  }

  @Delete('tiers/:id')
  async deleteTier(@Param('id') id: string) {
    return this.loyaltyService.deleteTier(id);
  }

  @Get('customer/:id/tier')
  async getCustomerTier(@Param('id') id: string) {
    return this.loyaltyService.getCustomerTier(id);
  }
}
