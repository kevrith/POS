import { Controller, Post, Get, Body, Patch, Param, Query, UseGuards, Req } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SaleType, PriceLevel } from '@pos/shared';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

interface CheckoutDto {
  /** Idempotency key: the same key never creates a second sale. */
  offlineId?: string;
  /**
   * A sale rung up offline by this person and uploaded later by someone else. Honoured only when the uploader is
   * an owner or manager of the same business, so a till cannot credit sales to an arbitrary colleague.
   */
  onBehalfOfCashierId?: string;
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
  tipCents?: number;
  orderId?: string; // hospitality order — if provided, close it and free the table
}

interface VoidDto {
  /** Only honoured when it is the caller's own id and the caller is an owner or manager. */
  managerId?: string;
  /** A manager PIN, verified on the server, for tills signed in as someone who cannot void alone. */
  managerPin?: string;
  reason: string;
  voidedItemIds?: string[];
  voidedItemQuantities?: Array<{ itemId: string; quantity: number }>;
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
      offlineId: dto.offlineId,
      storeId: dto.storeId,
      cashierId: await this.salesService.resolveCashierId(dto.businessId, req.user, dto.onBehalfOfCashierId),
      type: dto.type ?? SaleType.NORMAL,
      priceLevel: dto.priceLevel ?? PriceLevel.RETAIL,
      customerId: dto.customerId,
      items: dto.items,
      payments: dto.payments,
      discountCents: dto.discountCents,
      promotionId: dto.promotionId,
      serviceChargeCents: dto.serviceChargeCents,
      tipCents: dto.tipCents,
      orderId: dto.orderId,
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
    @Query('receiptNumber') receiptNumber?: string,
    @Query('cashierId') cashierId?: string,
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
      receiptNumber,
      cashierId,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  @Get('voided-returns')
  async getVoidedAndReturns(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.salesService.getVoidedAndReturns(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
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
    @Req() req: Request & { user: AuthUser },
  ) {
    const approverId = await this.salesService.resolveVoidApprover(req.user, businessId, dto);
    return this.salesService.voidSale(id, businessId, approverId, dto.reason, dto.voidedItemIds, dto.voidedItemQuantities);
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
    @Body() dto: { cashierId?: string; storeId?: string; payments: Array<{ method: string; amountCents: number; reference?: string }> },
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.salesService.convertProformaToSaleV2(id, {
      ...dto,
      cashierId: dto.cashierId ?? req.user.id,
    });
  }

  @Patch('proformas/:id/cancel')
  async cancelProforma(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.salesService.cancelProforma(id, req.user.businessId, req.user.id);
  }

  @Patch(':id/mark-credit-paid')
  async markCreditPaid(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() body: { amountCents?: number; method?: string } | undefined,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.salesService.markCreditPaid(id, businessId, body?.amountCents, body?.method, { id: req.user.id });
  }

  @Post(':id/return')
  async returnSale(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: { returnedItemIds?: string[]; reason: string; refundMethod: 'CASH' | 'STORE_CREDIT'; processedBy?: string },
    @Req() req: Request & { user: AuthUser },
  ) {
    // Who processed the refund comes from the login, so it cannot be blamed on someone else.
    return this.salesService.returnSale(id, businessId, { ...dto, processedBy: req.user.id });
  }
}
