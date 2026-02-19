import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { EtimsService } from './etims.service';

@Controller('etims')
export class EtimsController {
  constructor(private etimsService: EtimsService) {}

  @Post('submit/:saleId')
  async submitSale(@Param('saleId') saleId: string) {
    return this.etimsService.submitSale(saleId);
  }

  @Post('void/:saleId')
  async voidSale(@Param('saleId') saleId: string, @Body('reason') reason: string) {
    return this.etimsService.voidSale(saleId, reason);
  }

  @Get('stock-status')
  async getStockStatus(@Query('businessId') businessId: string) {
    return this.etimsService.getStockStatus(businessId);
  }
}
