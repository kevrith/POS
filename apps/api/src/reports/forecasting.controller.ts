import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('forecasting')
export class ForecastingController {
  constructor(private svc: ForecastingService) {}

  @Get('demand')
  getDemand(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('days') days?: string,
  ) {
    return this.svc.getForecast(businessId, storeId, days ? parseInt(days, 10) : 30);
  }

  @Get('top-movers')
  getTopMovers(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('period') period?: string,
  ) {
    return this.svc.getTopMovers(businessId, storeId, period);
  }

  @Get('seasonal')
  getSeasonal(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.svc.getSeasonalTrends(businessId, storeId);
  }
}
