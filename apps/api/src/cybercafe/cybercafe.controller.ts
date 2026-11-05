import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { CybercafeService } from './cybercafe.service';

type Authed = Request & { user: AuthUser };
const RATE_SETTERS = ['OWNER', 'ADMIN', 'MANAGER'];

@UseGuards(JwtAuthGuard)
@Controller('cybercafe')
export class CybercafeController {
  constructor(private svc: CybercafeService) {}

  // ── Public kiosk endpoints (no auth — run on customer's screen) ───────────
  @Public()
  @Get('kiosk/:stationId')
  getKioskData(@Param('stationId') stationId: string) {
    return this.svc.getKioskData(stationId);
  }

  @Public()
  @Post('kiosk/:stationId/call')
  callAttendant(@Param('stationId') stationId: string) {
    return this.svc.callAttendant(stationId);
  }

  // ── Stations ──────────────────────────────────────────────────────────────
  @RequiresFeature(Feature.CYBERCAFE)
  @Get('stations')
  getStations(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getStations(businessId, storeId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('stations')
  createStation(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createStation({ ...dto, businessId: req.user.businessId });
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Patch('stations/:id')
  updateStation(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateStation(id, req.user.businessId, dto);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  @RequiresFeature(Feature.CYBERCAFE)
  @Post('stations/:id/start')
  startSession(@Param('id') stationId: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.startSession(
      { ...dto, stationId, businessId: req.user.businessId },
      { canSetRate: RATE_SETTERS.includes(req.user.role) },
    );
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('sessions/:id/pause')
  pauseSession(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.pauseSession(id, req.user.businessId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('sessions/:id/resume')
  resumeSession(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.resumeSession(id, req.user.businessId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('sessions/:id/end')
  endSession(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.endSession(id, req.user.businessId, dto, { id: req.user.id });
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('sessions/:id/void')
  voidSession(@Param('id') id: string, @Body('reason') reason: string | undefined, @Req() req: Authed) {
    return this.svc.voidSession(id, req.user.businessId, reason);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('sessions/:id/extend')
  extendSession(@Param('id') id: string, @Body() body: { extraMinutes: number }, @Req() req: Authed) {
    return this.svc.extendSession(id, req.user.businessId, body?.extraMinutes);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Get('daily-summary')
  getDailySummary(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getDailySummary(businessId, storeId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Get('sessions')
  getSessions(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('stationId') stationId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.getSessions(businessId, storeId, { stationId, startDate, endDate, status });
  }

  // ── Packages ──────────────────────────────────────────────────────────────
  @RequiresFeature(Feature.CYBERCAFE)
  @Get('packages')
  getPackages(@Query('businessId') businessId: string) {
    return this.svc.getPackages(businessId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('packages')
  createPackage(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createPackage({ ...dto, businessId: req.user.businessId });
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Patch('packages/:id')
  updatePackage(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updatePackage(id, req.user.businessId, dto);
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  @RequiresFeature(Feature.CYBERCAFE)
  @Get('rates')
  getRates(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getRates(businessId, storeId);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Post('rates')
  createRate(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createRate({ ...dto, businessId: req.user.businessId });
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Patch('rates/:id')
  updateRate(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateRate(id, req.user.businessId, dto);
  }

  @RequiresFeature(Feature.CYBERCAFE)
  @Delete('rates/:id')
  deleteRate(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.deleteRate(id, req.user.businessId);
  }

  // ── Statistics ────────────────────────────────────────────────────────────
  @RequiresFeature(Feature.CYBERCAFE)
  @Get('stats')
  getStats(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getStats(businessId, storeId, startDate, endDate);
  }
}
