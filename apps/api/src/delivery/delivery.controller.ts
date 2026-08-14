import { Controller, Post, Get, Put, Body, Param, Query, Req, UseGuards, Patch, Delete } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  @Get('orders')
  async getDeliveryOrders(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('channel') channel?: string,
  ) {
    return this.deliveryService.getDeliveryOrders(businessId, storeId, status, search, channel);
  }

  // Alias: GET /delivery?businessId=...&storeId=...&status=...&channel=...
  @Get()
  async listDeliveries(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('channel') channel?: string,
  ) {
    const result = await this.deliveryService.getDeliveryOrders(businessId, storeId, status, search, channel);
    return result.data;
  }

  @Post('orders')
  async createDeliveryOrder(@Body() dto: any) {
    return this.deliveryService.createDeliveryOrder(dto);
  }

  // Alias: POST /delivery (frontend shorthand)
  @Post()
  async createDeliveryAlias(@Body() dto: any) {
    return this.deliveryService.createDeliveryOrder(dto);
  }

  // PATCH /delivery/:id — update status / notes
  @Patch(':id')
  async updateDelivery(@Param('id') id: string, @Body() dto: any) {
    return this.deliveryService.updateDeliveryOrder(id, dto);
  }

  // PATCH /delivery/:id/assign — assign driver
  @Patch(':id/assign')
  async assignDriverPatch(
    @Param('id') id: string,
    @Body() dto: { driverId: string; businessId: string },
  ) {
    return this.deliveryService.assignDriver(id, dto.driverId, dto.businessId);
  }

  // DELETE /delivery/:id — cancel delivery order
  @Delete(':id')
  async cancelDelivery(@Param('id') id: string) {
    return this.deliveryService.cancelDeliveryOrder(id);
  }

  @Public() // customer-facing tracking link — no login required
  @Get('orders/:orderNumber/track')
  async getDeliveryTracking(@Param('orderNumber') orderNumber: string) {
    return this.deliveryService.getDeliveryTracking(orderNumber);
  }

  @Put('orders/:id/assign-driver')
  async assignDriver(
    @Param('id') deliveryOrderId: string,
    @Body() dto: { driverId: string; businessId: string },
  ) {
    return this.deliveryService.assignDriver(deliveryOrderId, dto.driverId, dto.businessId);
  }

  @Put('orders/:id/delivered')
  async markDelivered(
    @Param('id') deliveryOrderId: string,
    @Body() dto: { businessId: string; proofPhotoUrl?: string },
  ) {
    return this.deliveryService.markDelivered(deliveryOrderId, dto.businessId, dto.proofPhotoUrl);
  }

  @Put('orders/:id/reschedule')
  async rescheduleDelivery(
    @Param('id') deliveryOrderId: string,
    @Body() dto: { newScheduledAt: string; reason: string },
  ) {
    return this.deliveryService.rescheduleDelivery(deliveryOrderId, dto.newScheduledAt, dto.reason);
  }

  @Post('driver-location')
  async updateDriverLocation(@Body() dto: any) {
    return this.deliveryService.updateDriverLocation(dto);
  }

  /** A driver's own pay. Drivers hit this with their own id; managers may pass any
   *  driver in their business — the service checks the driver belongs to it. */
  @Get('driver-earnings/:driverId')
  async getDriverEarnings(
    @Param('driverId') driverId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.deliveryService.getDriverEarnings(driverId, req.user.businessId);
  }

  /** Latest position of every driver reporting in — the dispatch map reads this.
   *  Business comes from the token, not the query: TenantGuard rejects a MISMATCHED
   *  businessId but lets a missing one through, and a missing one here would widen
   *  the query to every tenant's drivers. */
  @Get('driver-locations')
  async getActiveDriverLocations(
    @Req() req: Request & { user: AuthUser },
    @Query('sinceMinutes') sinceMinutes?: string,
  ) {
    return this.deliveryService.getActiveDriverLocations(
      req.user.businessId,
      sinceMinutes ? Number(sinceMinutes) : undefined,
    );
  }

  @Get('driver-locations/:driverId')
  async getDriverLocations(
    @Param('driverId') driverId: string,
    @Req() req: Request & { user: AuthUser },
    @Query('since') since?: string,
  ) {
    return this.deliveryService.getDriverLocations(driverId, req.user.businessId, since);
  }

  @Post('zones')
  async createDeliveryZone(@Body() dto: any) {
    return this.deliveryService.createDeliveryZone(dto);
  }

  @Get('zones')
  async getDeliveryZones(@Query('businessId') businessId: string) {
    return this.deliveryService.getDeliveryZones(businessId);
  }

  @Post('courier/push')
  async pushToCourier(@Body() dto: any) {
    return this.deliveryService.pushToCourier(dto);
  }

  @Get('sla-report')
  async getDeliverySLAReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.deliveryService.getDeliverySLAReport(businessId, startDate, endDate);
  }

  @Put('orders/:id/failed')
  async markFailed(
    @Param('id') id: string,
    @Body() dto: { reason: string },
  ) {
    return this.deliveryService.markFailed(id, dto.reason);
  }

  @Post('orders/:id/tracking-link')
  async sendTrackingLink(@Param('id') id: string) {
    return this.deliveryService.sendCustomerTrackingLink(id);
  }

  @Post('calc-fee')
  async calcFee(@Body() dto: { businessId: string; lat: number; lng: number }) {
    return this.deliveryService.calcDeliveryFee(dto.businessId, dto.lat, dto.lng);
  }

  @Get('couriers')
  async getCouriers(@Query('businessId') businessId: string) {
    return this.deliveryService.getCourierIntegrations(businessId);
  }

  @Post('couriers')
  async saveCourier(@Body() dto: any) {
    return this.deliveryService.saveCourierIntegration(dto);
  }

  // GET /delivery/:id — single delivery (driver app detail screen).
  // Declared last so it never shadows the literal GET routes above.
  @Get(':id')
  async getDelivery(
    @Param('id') id: string,
    @Query('businessId') businessId?: string,
  ) {
    return this.deliveryService.getDeliveryOrderById(id, businessId);
  }
}