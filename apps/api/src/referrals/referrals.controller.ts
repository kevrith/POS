import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.service';
import type { Request } from 'express';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get('code')
  getCode(@Req() req: Request & { user: AuthUser }) {
    return this.referrals.getOrCreateReferralCode(req.user.businessId).then((code) => ({ code }));
  }

  @Get()
  list(@Req() req: Request & { user: AuthUser }) {
    return this.referrals.listReferrals(req.user.businessId);
  }

  @Get('stats')
  stats(@Req() req: Request & { user: AuthUser }) {
    return this.referrals.getReferralStats(req.user.businessId);
  }

  @Post('activate-license')
  activateLicense(@Req() req: Request & { user: AuthUser }, @Body() body: { key: string }) {
    return this.referrals.activateLicenseKey(req.user.businessId, body.key);
  }
}
