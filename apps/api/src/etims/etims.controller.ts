import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { EtimsService } from './etims.service';

@Controller('etims')
export class EtimsController {
  constructor(private etimsService: EtimsService) {}

  // ─── Sale lifecycle ───────────────────────────────────────────────────────

  @Post('submit/:saleId')
  submitSale(@Param('saleId') saleId: string) {
    return this.etimsService.submitSale(saleId);
  }

  @Post('void/:saleId')
  voidSale(@Param('saleId') saleId: string, @Body('reason') reason: string) {
    return this.etimsService.voidSale(saleId, reason);
  }

  @Post('amend/:saleId')
  submitAmendment(@Param('saleId') saleId: string) {
    return this.etimsService.submitAmendment(saleId);
  }

  @Get('stock-status')
  getStockStatus(@Query('businessId') businessId: string) {
    return this.etimsService.getStockStatus(businessId);
  }

  @Get('pending-count')
  getPendingCount(@Query('businessId') businessId: string) {
    return this.etimsService.getPendingCount(businessId);
  }

  @Post('batch-submit')
  batchSubmit(@Query('businessId') businessId: string) {
    return this.etimsService.batchSubmit(businessId);
  }

  // ─── Production onboarding ────────────────────────────────────────────────

  @Post('production-onboarding')
  initiateProductionOnboarding(@Body() body: {
    businessId: string;
    kraPin: string;
    businessName: string;
    businessAddress: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail: string;
    certificateFile?: string;
  }) {
    return this.etimsService.initiateProductionOnboarding(body);
  }

  @Post('switch-production/:businessId')
  switchToProductionMode(@Param('businessId') businessId: string) {
    return this.etimsService.switchToProductionMode(businessId);
  }

  // ─── iTax integration ─────────────────────────────────────────────────────

  @Post('enable-itax')
  enableItaxIntegration(@Body() body: { businessId: string; username: string; password: string; kraPin: string }) {
    const { businessId, ...credentials } = body;
    return this.etimsService.enableItaxIntegration(businessId, credentials);
  }

  // ─── VAT returns ──────────────────────────────────────────────────────────

  @Get('vat-return-data')
  getVatReturnData(@Query('businessId') businessId: string, @Query('period') period: string) {
    return this.etimsService.getVatReturnData(businessId, period);
  }

  @Post('submit-vat-return')
  submitVatReturn(@Body() body: {
    businessId: string;
    period: string;
    totalSales: number;
    totalPurchases: number;
    vatOnSales: number;
    vatOnPurchases: number;
    netVat: number;
  }) {
    return this.etimsService.submitVatReturn(body);
  }
}
