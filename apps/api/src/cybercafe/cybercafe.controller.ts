import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { CybercafeService } from './cybercafe.service';

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
  @Get('stations')
  getStations(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getStations(businessId, storeId);
  }

  @Post('stations')
  createStation(@Body() dto: any) {
    return this.svc.createStation(dto);
  }

  @Patch('stations/:id')
  updateStation(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateStation(id, dto);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  @Post('stations/:id/start')
  startSession(@Param('id') stationId: string, @Body() dto: any) {
    return this.svc.startSession({ ...dto, stationId });
  }

  @Post('sessions/:id/pause')
  pauseSession(@Param('id') id: string) {
    return this.svc.pauseSession(id);
  }

  @Post('sessions/:id/resume')
  resumeSession(@Param('id') id: string) {
    return this.svc.resumeSession(id);
  }

  @Post('sessions/:id/end')
  endSession(@Param('id') id: string, @Body() dto: any) {
    return this.svc.endSession(id, dto);
  }

  @Post('sessions/:id/void')
  voidSession(@Param('id') id: string) {
    return this.svc.voidSession(id);
  }

  @Post('sessions/:id/extend')
  extendSession(@Param('id') id: string, @Body() body: { extraMinutes: number }) {
    return this.svc.extendSession(id, body.extraMinutes);
  }

  @Get('daily-summary')
  getDailySummary(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getDailySummary(businessId, storeId);
  }

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
  @Get('packages')
  getPackages(@Query('businessId') businessId: string) {
    return this.svc.getPackages(businessId);
  }

  @Post('packages')
  createPackage(@Body() dto: any) {
    return this.svc.createPackage(dto);
  }

  @Patch('packages/:id')
  updatePackage(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updatePackage(id, dto);
  }

  // ── Rates ──────────────────────────────────────────────────────────────────
  @Get('rates')
  getRates(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getRates(businessId, storeId);
  }

  @Post('rates')
  createRate(@Body() dto: any) {
    return this.svc.createRate(dto);
  }

  @Patch('rates/:id')
  updateRate(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateRate(id, dto);
  }

  @Delete('rates/:id')
  deleteRate(@Param('id') id: string) {
    return this.svc.deleteRate(id);
  }

  // ── Statistics ────────────────────────────────────────────────────────────
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
