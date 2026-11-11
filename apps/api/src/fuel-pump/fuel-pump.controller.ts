import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FuelPumpService } from './fuel-pump.service';
import { FuelPumpGateway } from './fuel-pump.gateway';
import { FuelControlService } from './fuel-control.service';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.FUEL_PUMP)
@Controller('fuel-pump')
export class FuelPumpController {
  constructor(private svc: FuelPumpService, private control: FuelControlService, private gateway: FuelPumpGateway) {}

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
    return this.svc.updateGrade(id, req.user.businessId, dto, req.user.name);
  }

  /** Every price change for a grade: who, when, from what to what. */
  @Get('grades/:id/price-history')
  getPriceHistory(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.getPriceHistory(req.user.businessId, id);
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

  /** A hose on a dispenser: its grade, the tank it draws from, and its own meter. */
  @Post('pumps/:id/nozzles')
  addNozzle(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.addNozzle(id, req.user.businessId, dto ?? {});
  }

  @Patch('nozzles/:id')
  updateNozzle(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.updateNozzle(id, req.user.businessId, dto ?? {});
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
  /** The receipt of a pump sale, to print again. */
  @Get('sales/:id/receipt')
  getReceipt(@Param('id') id: string, @Req() req: Request & { user: AuthUser }) {
    return this.svc.getReceipt(id, req.user.businessId);
  }

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
    return this.control.getDippings(req.user.businessId, tankId);
  }

  /** Who took the reading is the signed-in user, not a name typed into the request. */
  @Post('tanks/dipping')
  recordDipping(@Body() dto: any, @Req() req: Authed) {
    return this.control.recordDipping({ ...dto, businessId: req.user.businessId, recordedBy: req.user.name });
  }

  @Post('tanks/delivery')
  recordDelivery(@Body() dto: any, @Req() req: Authed) {
    return this.control.recordDelivery({ ...dto, businessId: req.user.businessId, recordedBy: req.user.name });
  }

  @Get('deliveries')
  getDeliveries(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.control.getDeliveries(businessId, startDate, endDate);
  }

  // ── Pump tests ────────────────────────────────────────────────────────────
  @Get('tests')
  getPumpTests(@Query('storeId') storeId: string, @Query('shiftId') shiftId: string | undefined, @Req() req: Authed) {
    return this.control.getPumpTests(req.user.businessId, storeId, shiftId);
  }

  @Post('tests')
  recordPumpTest(@Body() dto: any, @Req() req: Authed) {
    return this.control.recordPumpTest({ ...dto, businessId: req.user.businessId, recordedBy: req.user.name });
  }

  // ── Variance Report ───────────────────────────────────────────────────────
  @Get('variance')
  getVarianceReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.control.getVarianceReport(businessId, storeId, startDate, endDate);
  }

  // ── Shifts ────────────────────────────────────────────────────────────────
  @Get('shifts')
  getShifts(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.control.getShifts(businessId, storeId);
  }

  @Get('shifts/open')
  getOpenShift(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.control.getOpenShift(businessId, storeId);
  }

  @Post('shifts/open')
  openShift(@Body() dto: any, @Req() req: Authed) {
    return this.control.openShift({ ...dto, businessId: req.user.businessId, cashierId: req.user.id, cashierName: dto?.cashierName || req.user.name });
  }

  /** Closing meter of every nozzle and the cash each attendant hands in; the reconciliation is kept on the shift. */
  @Post('shifts/:id/close')
  closeShift(@Param('id') id: string, @Body() body: any, @Req() req: Authed) {
    return this.control.closeShift(id, req.user.businessId, { id: req.user.id, name: req.user.name }, body ?? {});
  }

  @Get('shifts/:id/summary')
  getShiftSummary(@Param('id') id: string, @Req() req: Authed) {
    return this.control.getShiftSummary(id, req.user.businessId);
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
