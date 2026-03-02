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

  @Post('amend/:saleId')
  async submitAmendment(@Param('saleId') saleId: string) {
    return this.etimsService.submitAmendment(saleId);
  }

  @Get('stock-status')
  async getStockStatus(@Query('businessId') businessId: string) {
    return this.etimsService.getStockStatus(businessId);
  }

  @Get('pending-count')
  async getPendingCount(@Query('businessId') businessId: string) {
    return this.etimsService.getPendingCount(businessId);
  }

  @Post('batch-submit')
  async batchSubmit(@Query('businessId') businessId: string) {
    return this.etimsService.batchSubmit(businessId);
  }
}
