import {
  Controller, Get, Post, Query, Param, Body, Headers,
  Req, UseGuards, RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import type { AuthUser } from '../auth/auth.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(
    private subscriptionLimits: SubscriptionLimitsService,
    private subscriptionService: SubscriptionService,
  ) {}

  /** Current usage stats (stores, users, tx count vs plan limits) */
  @UseGuards(JwtAuthGuard, TenantGuard)
  @Get('usage')
  async getUsage(@Query('businessId') businessId: string) {
    return this.subscriptionLimits.getUsageStats(businessId);
  }

  /** Available plans list — no auth required (used on landing page / pricing) */
  @SkipSubscriptionCheck()
  @Get('plans')
  getPlans() {
    return this.subscriptionService.getPlans();
  }

  /** Current subscription status for the authenticated business */
  @UseGuards(JwtAuthGuard, TenantGuard)
  @SkipSubscriptionCheck()
  @Get('status')
  async getStatus(@Req() req: Request & { user: AuthUser }) {
    return this.subscriptionService.getStatus(req.user.businessId);
  }

  /**
   * Initiate a Paystack payment for the selected tier.
   * Returns { authorizationUrl, reference } — frontend redirects to authorizationUrl.
   * FREE tier returns { authorizationUrl: null, reference: null } and activates immediately.
   */
  @UseGuards(JwtAuthGuard, TenantGuard)
  @SkipSubscriptionCheck()
  @Post('checkout')
  async checkout(
    @Req() req: Request & { user: AuthUser },
    @Body() body: { tier: string; email: string },
  ) {
    return this.subscriptionService.initializeCheckout(
      req.user.businessId,
      body.tier as any,
      body.email,
    );
  }

  /**
   * Verify a Paystack payment after redirect back from Paystack.
   * Called by the frontend when the user lands back on /settings?tab=subscription&ref=...
   */
  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Get('verify/:reference')
  async verify(@Param('reference') reference: string) {
    return this.subscriptionService.verifyPayment(reference);
  }

  /**
   * Paystack webhook — receives charge.success / subscription.disable events.
   * Must be public (no auth) and use the raw body for HMAC verification.
   */
  @SkipSubscriptionCheck()
  @Post('webhook/paystack')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() ?? '';
    await this.subscriptionService.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
