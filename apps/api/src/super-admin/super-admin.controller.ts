import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, OnModuleInit,
} from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';

@Public()
@Controller('super-admin')
@SkipSubscriptionCheck()
export class SuperAdminController implements OnModuleInit {
  constructor(private service: SuperAdminService) {}

  async onModuleInit() {
    await this.service.ensureDefaultAdmin();
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.service.login(body.email, body.password);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('stats')
  getStats() {
    return this.service.getPlatformStats();
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('businesses')
  listBusinesses(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
  ) {
    return this.service.listBusinesses(parseInt(page), parseInt(limit), search);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('businesses/recent')
  recentSignups(@Query('days') days = '30') {
    return this.service.getRecentSignups(parseInt(days));
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('businesses/:id/subscription')
  updateSubscription(
    @Param('id') id: string,
    @Body() body: { subscriptionStatus?: string; subscriptionTier?: string; planName?: string; trialEndsAt?: string },
  ) {
    return this.service.updateBusinessSubscription(id, {
      ...body,
      trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : undefined,
    });
  }

  @UseGuards(SuperAdminAuthGuard)
  @Post('businesses/:id/impersonate')
  impersonate(@Param('id') id: string) {
    return this.service.impersonate(id);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('license-keys')
  listKeys(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.listLicenseKeys(parseInt(page), parseInt(limit));
  }

  @UseGuards(SuperAdminAuthGuard)
  @Post('license-keys')
  createKey(@Body() body: { tier: string; expiresAt?: string }) {
    return this.service.createLicenseKey({
      tier: body.tier,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('license-keys/:id/revoke')
  revokeKey(@Param('id') id: string) {
    return this.service.revokeLicenseKey(id);
  }

  // ── Health Dashboard ──────────────────────────────────────────────────────

  @UseGuards(SuperAdminAuthGuard)
  @Get('health')
  getHealth() {
    return this.service.getSystemHealth();
  }

  // ── Business Support View ─────────────────────────────────────────────────

  @UseGuards(SuperAdminAuthGuard)
  @Get('businesses/:id/data')
  getBusinessData(@Param('id') id: string) {
    return this.service.getBusinessData(id);
  }

  // ── Force Update ──────────────────────────────────────────────────────────

  @UseGuards(SuperAdminAuthGuard)
  @Post('force-update')
  forceUpdate(
    @Body() body: { version: string; message: string; isRequired?: boolean },
  ) {
    return this.service.triggerForceUpdate(body.version, body.message, body.isRequired);
  }

  /** Public — no auth required. Called by clients to check if an update is pending. */
  @Get('update-check')
  updateCheck() {
    return this.service.checkForUpdate();
  }
}
