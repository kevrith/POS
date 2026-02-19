import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sales')
  async salesReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.salesReport(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('payment-methods')
  async paymentMethodBreakdown(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.paymentMethodBreakdown(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('vat')
  async vatReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.vatReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('tot')
  async totReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.totReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('stock-valuation')
  async stockValuation(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.stockValuation(businessId, storeId);
  }

  @Get('profit-loss')
  async profitAndLoss(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.profitAndLoss(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('x-report')
  async xReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('cashierId') cashierId: string,
  ) {
    return this.reports.xReport(businessId, storeId, cashierId);
  }

  @Post('z-report')
  async zReport(
    @Body() dto: { businessId: string; storeId: string; cashierId: string; closingBalanceCents: number },
  ) {
    return this.reports.zReport(dto.businessId, dto.storeId, dto.cashierId, dto.closingBalanceCents);
  }

  @Get('expenses')
  async expenseReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
  ) {
    return this.reports.expenseReport(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      category,
    );
  }

  @Get('commissions')
  async commissionReport(
    @Query('businessId') businessId: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.commissionReport(
      businessId,
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('attendance')
  async attendanceReport(
    @Query('businessId') businessId: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.attendanceReport(
      businessId,
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }
}
