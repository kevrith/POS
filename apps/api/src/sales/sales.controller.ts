import { Controller, Post, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SaleType, PriceLevel } from '@pos/shared';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

interface CheckoutDto {
  storeId: string;
  businessId: string;
  cashierId: string;
  type: SaleType;
  priceLevel: PriceLevel;
  customerId?: string;
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
  discountCents?: number;
  promotionId?: string;
  serviceChargeCents?: number;
}

interface VoidDto {
  managerId: string;
  reason: string;
  voidedItemIds?: string[];
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  /** Main checkout endpoint — called from POS screen */
  @Post('checkout')
  async checkout(
    @Body() dto: CheckoutDto,
    @Req() req: Request & { user: AuthUser },
  ) {
    // businessId comes from body and is validated by TenantGuard
    return this.salesService.createSale(dto.businessId, {
      storeId: dto.storeId,
      cashierId: req.user.id,
      type: dto.type ?? SaleType.NORMAL,
      priceLevel: dto.priceLevel ?? PriceLevel.RETAIL,
      customerId: dto.customerId,
      items: dto.items,
      payments: dto.payments,
      discountCents: dto.discountCents,
      promotionId: dto.promotionId,
      serviceChargeCents: dto.serviceChargeCents,
    });
  }

  @Get()
  async findAll(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('etimsSubmitted') etimsSubmitted?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.salesService.findAll({
      businessId,
      storeId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      etimsSubmitted: etimsSubmitted !== undefined ? etimsSubmitted === 'true' : undefined,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  @Get('proformas')
  async getProformas(@Query('businessId') businessId: string) {
    return this.salesService.getProformas(businessId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.salesService.getSale(id, businessId);
  }

  @Post(':id/void')
  async voidSale(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: VoidDto,
  ) {
    return this.salesService.voidSale(id, businessId, dto.managerId, dto.reason, dto.voidedItemIds);
  }

  @Post('verify-manager-pin')
  async verifyManagerPin(
    @Body() dto: { pin: string; businessId: string },
  ) {
    return this.salesService.verifyManagerPin(dto.pin, dto.businessId);
  }

  @Post('proformas')
  async createProforma(@Body() dto: { businessId: string; customerName: string; customerPhone?: string; items: Array<{ name: string; quantity: number; unitPriceCents: number }>; validUntil?: string; notes?: string }) {
    return this.salesService.createProforma(dto);
  }

  @Post('proformas/:id/convert')
  async convertProforma(
    @Param('id') id: string,
    @Body() dto: { businessId: string; storeId: string; cashierId: string; payments: Array<{ method: string; amountCents: number }> },
  ) {
    return this.salesService.convertProformaToSale(id, dto);
  }

  @Post('proforma/:id/convert')
  async convertProformaToSaleV2(
    @Param('id') id: string,
    @Body() dto: { cashierId: string; payments: Array<{ method: string; amountCents: number; reference?: string }> },
  ) {
    return this.salesService.convertProformaToSaleV2(id, dto);
  }

  @Post(':id/return')
  async returnSale(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: { returnedItemIds?: string[]; reason: string; refundMethod: 'CASH' | 'STORE_CREDIT' },
  ) {
    return this.salesService.returnSale(id, businessId, dto);
  }
}
