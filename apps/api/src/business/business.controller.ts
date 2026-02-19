import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('business')
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Get(':businessId/settings')
  async getSettings(@Param('businessId') businessId: string) {
    return this.businessService.getSettings(businessId);
  }

  @Patch(':businessId/settings')
  async updateSettings(
    @Param('businessId') businessId: string,
    @Body() dto: {
      name?: string;
      taxType?: 'VAT' | 'TOT';
      serviceChargeRate?: number;
      negativePolicyDefault?: 'BLOCK' | 'WARN' | 'ALLOW';
      posMode?: string;
      expiredItemPolicy?: string;
      expenseApprovalThresholdCents?: number;
    },
  ) {
    return this.businessService.updateSettings(businessId, dto);
  }

  @Get(':businessId/stores')
  async getStores(@Param('businessId') businessId: string) {
    return this.businessService.getStores(businessId);
  }

  @Post(':businessId/stores')
  async createStore(
    @Param('businessId') businessId: string,
    @Body() dto: { name: string; storeCode: string },
  ) {
    return this.businessService.createStore(businessId, dto);
  }

  @Get(':businessId/subscription')
  async getSubscription(@Param('businessId') businessId: string) {
    return this.businessService.getSubscriptionStatus(businessId);
  }
}
