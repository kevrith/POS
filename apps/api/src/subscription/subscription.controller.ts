import { Controller, Get, Post, Param, Body, Req, Headers, RawBodyRequest, HttpCode, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import type { AuthUser } from '../auth/auth.service';

@Controller('subscription')
@SkipSubscriptionCheck()
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.subscription.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('status')
  getStatus(@Req() req: Request & { user: AuthUser }) {
    return this.subscription.getStatus(req.user.businessId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async initializeCheckout(
    @Req() req: Request & { user: AuthUser },
    @Body() body: { tier: 'STARTER' | 'PRO' | 'ENTERPRISE'; email: string },
  ) {
    return this.subscription.initializeCheckout(req.user.businessId, body.tier, body.email);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:reference')
  async verifyPayment(@Param('reference') reference: string) {
    return this.subscription.verifyPayment(reference);
  }

  /** Paystack webhook — must receive raw body for signature verification */
  @Public()
  @Post('webhook/paystack')
  @HttpCode(200)
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString() ?? JSON.stringify(req.body);
    await this.subscription.handleWebhook(rawBody, signature);
    return { received: true };
  }
}
