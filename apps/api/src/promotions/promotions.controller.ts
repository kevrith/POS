import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';

@RequiresFeature(Feature.PROMOTIONS)
@Controller('promotions')
export class PromotionsController {
  constructor(private promotionsService: PromotionsService) {}

  @Post()
  async createPromotion(@Body() data: {
    businessId: string;
    name: string;
    type: string;
    discountType: string;
    discountValue: number;
    minPurchaseCents?: number;
    maxDiscountCents?: number;
    startDate: string;
    endDate: string;
    applicableItems?: string[];
  }) {
    return this.promotionsService.createPromotion({
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });
  }

  @Get('active')
  async getActivePromotions(@Query('businessId') businessId: string) {
    return this.promotionsService.getActivePromotions(businessId);
  }

  @Post(':id/apply')
  async applyPromotion(
    @Param('id') id: string,
    @Body() data: { subtotalCents: number; itemIds: string[] }
  ) {
    return this.promotionsService.applyPromotion(id, data.subtotalCents, data.itemIds);
  }

  @Patch(':id')
  async updatePromotion(@Param('id') id: string, @Body() data: Partial<{
    name: string;
    isActive: boolean;
    endDate: string;
  }>) {
    return this.promotionsService.updatePromotion(id, {
      ...data,
      ...(data.endDate && { endDate: new Date(data.endDate) }),
    });
  }

  @Get()
  async getPromotions(@Query('businessId') businessId: string) {
    return this.promotionsService.getPromotions(businessId);
  }

  @Delete(':id')
  async deletePromotion(@Param('id') id: string) {
    return this.promotionsService.deletePromotion(id);
  }
}
