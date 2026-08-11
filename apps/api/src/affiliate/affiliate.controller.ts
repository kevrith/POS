import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/jwt-auth.guard';
import { AffiliateService } from './affiliate.service';
import { AffiliateJwtGuard } from './affiliate-jwt.guard';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';

type AffiliateReq = Request & { affiliateId: string };

@Controller('affiliate')
@Public() // exempt from the global JwtAuthGuard; each group applies its own guard
export class AffiliateController {
  constructor(private readonly svc: AffiliateService) {}

  // ── Public auth ─────────────────────────────────────────────────────────────
  @Post('auth/register')
  register(@Body() body: { name: string; email: string; phone?: string; password: string }) {
    return this.svc.register(body);
  }

  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.svc.login(body);
  }

  // ── Affiliate dashboard (AffiliateJwtGuard) ──────────────────────────────────
  @Get('me')
  @UseGuards(AffiliateJwtGuard)
  me(@Req() req: AffiliateReq) {
    return this.svc.getMe(req.affiliateId);
  }

  @Patch('me')
  @UseGuards(AffiliateJwtGuard)
  updateMe(@Req() req: AffiliateReq, @Body() body: { payoutMethod?: string; payoutDetails?: string }) {
    return this.svc.updateProfile(req.affiliateId, body);
  }

  @Get('me/conversions')
  @UseGuards(AffiliateJwtGuard)
  conversions(@Req() req: AffiliateReq) {
    return this.svc.getConversions(req.affiliateId);
  }

  @Get('me/commissions')
  @UseGuards(AffiliateJwtGuard)
  commissions(@Req() req: AffiliateReq) {
    return this.svc.getCommissions(req.affiliateId);
  }

  @Get('me/payouts')
  @UseGuards(AffiliateJwtGuard)
  payouts(@Req() req: AffiliateReq) {
    return this.svc.getPayouts(req.affiliateId);
  }

  // ── Admin (SuperAdminAuthGuard) ──────────────────────────────────────────────
  @Get('admin')
  @UseGuards(SuperAdminAuthGuard)
  adminList(@Query('status') status?: string) {
    return this.svc.adminList(status);
  }

  @Get('admin/:id')
  @UseGuards(SuperAdminAuthGuard)
  adminGet(@Param('id') id: string) {
    return this.svc.adminGet(id);
  }

  @Patch('admin/:id/status')
  @UseGuards(SuperAdminAuthGuard)
  adminSetStatus(@Param('id') id: string, @Body() body: { status: string; commissionPercent?: number }) {
    return this.svc.adminSetStatus(id, body.status, body.commissionPercent);
  }

  @Post('admin/:id/payout')
  @UseGuards(SuperAdminAuthGuard)
  adminPayout(@Param('id') id: string, @Body() body: { amountCents: number; method?: string; reference?: string; notes?: string }) {
    return this.svc.adminRecordPayout(id, body);
  }
}
