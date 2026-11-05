import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FuelPumpService } from './fuel-pump.service';
import { FuelPumpGateway } from './fuel-pump.gateway';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.FUEL_PUMP)
@Controller('fuel-pump')
export class FuelPumpController {
  constructor(private svc: FuelPumpService, private gateway: FuelPumpGateway) {}

  // ── TCP status ─────────────────────────────────────────────────────────────
  @Get('tcp-status')
  getTcpStatus(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.gateway.getTcpStatus(businessId, storeId) ?? { connected: false };
  }

  // ── Grades ────────────────────────────────────────────────────────────────
  @Get('grades')
  getGrades(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getGrades(businessId, storeId);
  }

  @Post('grades')
  createGrade(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createGrade({ ...dto, businessId: req.user.businessId });
  }

  @Patch('grades/:id')
  updateGrade(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateGrade(id, req.user.businessId, dto);
  }

  // ── Pumps ─────────────────────────────────────────────────────────────────
  @Get('pumps')
  getPumps(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getPumps(businessId, storeId);
  }

  @Post('pumps')
  createPump(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createPump({ ...dto, businessId: req.user.businessId });
  }

  @Patch('pumps/:id')
  updatePump(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updatePump(id, req.user.businessId, dto);
  }

  @Post('pumps/:id/authorize')
  authorizePump(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.authorizePump(id, req.user.businessId);
  }

  @Post('pumps/:id/stop')
  stopPump(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.stopPump(id, req.user.businessId);
  }

  // ── Sales ─────────────────────────────────────────────────────────────────
  @Get('sales')
  getSales(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('pumpId') pumpId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getSales(businessId, storeId, { pumpId, startDate, endDate });
  }

  /** The price is the grade's, set by the server, and the cashier is whoever is signed in. */
  @Post('sales')
  recordSale(@Body() dto: any, @Req() req: Authed) {
    return this.svc.recordSale({ ...dto, businessId: req.user.businessId, cashierId: req.user.id });
  }

  /** A manager takes a pump sale back: the litres return to the tank and a fleet account is credited. */
  @Post('sales/:id/void')
  voidSale(@Param('id') id: string, @Body('reason') reason: string, @Req() req: Authed) {
    return this.svc.voidSale(id, req.user.businessId, { id: req.user.id, name: req.user.name, role: String(req.user.role) }, reason);
  }

  @Get('stats')
  getStats(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getSaleStats(businessId, storeId, startDate, endDate);
  }

  // ── Tanks ─────────────────────────────────────────────────────────────────
  @Get('tanks')
  getTanks(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getTanks(businessId, storeId);
  }

  @Post('tanks')
  createTank(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createTank({ ...dto, businessId: req.user.businessId });
  }

  @Patch('tanks/:id')
  updateTank(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateTank(id, req.user.businessId, dto);
  }

  @Get('tanks/:id/dippings')
  getDippings(@Param('id') tankId: string, @Req() req: Authed) {
    return this.svc.getDippings(req.user.businessId, tankId);
  }

  /** Who took the reading is the signed-in user, not a name typed into the request. */
  @Post('tanks/dipping')
  recordDipping(@Body() dto: any, @Req() req: Authed) {
    return this.svc.recordDipping({ ...dto, businessId: req.user.businessId, recordedBy: req.user.name });
  }

  @Post('tanks/delivery')
  recordDelivery(@Body() dto: any, @Req() req: Authed) {
    return this.svc.recordDelivery({ ...dto, businessId: req.user.businessId });
  }

  @Get('deliveries')
  getDeliveries(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getDeliveries(businessId, startDate, endDate);
  }

  // ── Variance Report ───────────────────────────────────────────────────────
  @Get('variance')
  getVarianceReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getVarianceReport(businessId, storeId, startDate, endDate);
  }

  // ── Shifts ────────────────────────────────────────────────────────────────
  @Get('shifts')
  getShifts(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getShifts(businessId, storeId);
  }

  @Get('shifts/open')
  getOpenShift(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getOpenShift(businessId, storeId);
  }

  @Post('shifts/open')
  openShift(@Body() dto: any, @Req() req: Authed) {
    return this.svc.openShift({ ...dto, businessId: req.user.businessId, cashierId: req.user.id, cashierName: dto?.cashierName || req.user.name });
  }

  @Post('shifts/:id/close')
  closeShift(@Param('id') id: string, @Body('readings') readings: any[], @Req() req: Authed) {
    return this.svc.closeShift(id, req.user.businessId, readings ?? []);
  }

  @Get('shifts/:id/summary')
  getShiftSummary(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.getShiftSummary(id, req.user.businessId);
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────
  @Get('fleet')
  getFleetAccounts(@Query('businessId') businessId: string) {
    return this.svc.getFleetAccounts(businessId);
  }

  @Post('fleet')
  createFleetAccount(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createFleetAccount({ ...dto, businessId: req.user.businessId });
  }

  @Patch('fleet/:id')
  updateFleetAccount(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateFleetAccount(id, req.user.businessId, dto);
  }

  @Get('fleet/:id/transactions')
  getFleetTransactions(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.getFleetTransactions(req.user.businessId, id);
  }

  @Post('fleet/:id/payment')
  recordFleetPayment(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.recordFleetPayment({ ...dto, businessId: req.user.businessId, fleetAccountId: id });
  }

  // ── Maintenance Log ────────────────────────────────────────────────────────
  @Get('maintenance')
  getMaintenanceLogs(
    @Query('businessId') businessId: string,
    @Query('pumpId') pumpId?: string,
  ) {
    return this.svc.getMaintenanceLogs(businessId, pumpId);
  }

  @Post('maintenance')
  createMaintenanceLog(@Body() dto: any, @Req() req: Authed) {
    return this.svc.createMaintenanceLog({ ...dto, businessId: req.user.businessId });
  }

  @Patch('maintenance/:id')
  updateMaintenanceLog(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateMaintenanceLog(id, req.user.businessId, dto);
  }
}
