import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private subscriptionLimits: SubscriptionLimitsService) {}

  /**
   * Get current usage stats for the business
   * Shows stores, users, and transaction counts vs limits
   */
  @Get('usage')
  async getUsage(@Query('businessId') businessId: string) {
    return this.subscriptionLimits.getUsageStats(businessId);
  }
}
