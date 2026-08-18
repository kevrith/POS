import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FuelPumpService } from './fuel-pump.service';
import { FuelPumpGateway } from './fuel-pump.gateway';

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
  createGrade(@Body() dto: any) {
    return this.svc.createGrade(dto);
  }

  @Patch('grades/:id')
  updateGrade(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateGrade(id, dto);
  }

  // ── Pumps ─────────────────────────────────────────────────────────────────
  @Get('pumps')
  getPumps(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.svc.getPumps(businessId, storeId);
  }

  @Post('pumps')
  createPump(@Body() dto: any) {
    return this.svc.createPump(dto);
  }

  @Patch('pumps/:id')
  updatePump(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updatePump(id, dto);
  }

  @Post('pumps/:id/authorize')
  authorizePump(@Param('id') id: string) {
    return this.svc.authorizePump(id);
  }

  @Post('pumps/:id/stop')
  stopPump(@Param('id') id: string) {
    return this.svc.stopPump(id);
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

  @Post('sales')
  recordSale(@Body() dto: any) {
    return this.svc.recordSale(dto);
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
  createTank(@Body() dto: any) {
    return this.svc.createTank(dto);
  }

  @Patch('tanks/:id')
  updateTank(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateTank(id, dto);
  }

  @Get('tanks/:id/dippings')
  getDippings(@Param('id') tankId: string) {
    return this.svc.getDippings(tankId);
  }

  @Post('tanks/dipping')
  recordDipping(@Body() dto: any) {
    return this.svc.recordDipping(dto);
  }

  @Post('tanks/delivery')
  recordDelivery(@Body() dto: any) {
    return this.svc.recordDelivery(dto);
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
  openShift(@Body() dto: any) {
    return this.svc.openShift(dto);
  }

  @Post('shifts/:id/close')
  closeShift(@Param('id') id: string, @Body('readings') readings: any[]) {
    return this.svc.closeShift(id, readings ?? []);
  }

  @Get('shifts/:id/summary')
  getShiftSummary(@Param('id') id: string) {
    return this.svc.getShiftSummary(id);
  }

  // ── Fleet ─────────────────────────────────────────────────────────────────
  @Get('fleet')
  getFleetAccounts(@Query('businessId') businessId: string) {
    return this.svc.getFleetAccounts(businessId);
  }

  @Post('fleet')
  createFleetAccount(@Body() dto: any) {
    return this.svc.createFleetAccount(dto);
  }

  @Patch('fleet/:id')
  updateFleetAccount(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateFleetAccount(id, dto);
  }

  @Get('fleet/:id/transactions')
  getFleetTransactions(@Param('id') id: string) {
    return this.svc.getFleetTransactions(id);
  }

  @Post('fleet/:id/payment')
  recordFleetPayment(@Param('id') id: string, @Body() dto: any) {
    return this.svc.recordFleetPayment({ ...dto, fleetAccountId: id });
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
  createMaintenanceLog(@Body() dto: any) {
    return this.svc.createMaintenanceLog(dto);
  }

  @Patch('maintenance/:id')
  updateMaintenanceLog(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateMaintenanceLog(id, dto);
  }
}
