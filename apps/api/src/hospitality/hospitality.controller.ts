import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { HospitalityService } from './hospitality.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionGuard, RequiresFeature } from '../auth/subscription.guard';
import { HospitalityAccessGuard } from './hospitality-access.guard';
import { Feature } from '@pos/shared';

type AuthedRequest = Request & { user?: AuthUser };

/**
 * The caller's business. Every route scopes its data to this, never to a
 * businessId sent in the query or body, which any signed-in user could change.
 */
function businessOf(req: AuthedRequest): string {
  const id = req.user?.businessId;
  if (!id) throw new UnauthorizedException();
  return id;
}

function userOf(req: AuthedRequest): AuthUser {
  if (!req.user) throw new UnauthorizedException();
  return req.user;
}

@UseGuards(JwtAuthGuard, SubscriptionGuard, HospitalityAccessGuard)
@RequiresFeature(Feature.HOSPITALITY)
@Controller('hospitality')
export class HospitalityController {
  constructor(private hospitalityService: HospitalityService) {}

  // ── Tables ─────────────────────────────────────────────────────────────────

  @RequiresFeature(Feature.HOSPITALITY)
  @Get('tables')
  async getTables(@Req() req: AuthedRequest, @Query('storeId') storeId: string, @Query('status') status?: string) {
    return this.hospitalityService.getTables(storeId, businessOf(req), status);
  }

  @RequiresFeature(Feature.HOSPITALITY)
  @Post('tables')
  async createTable(@Req() req: AuthedRequest, @Body() data: { storeId?: string; number: string; capacity: number; floor?: string }) {
    return this.hospitalityService.createTable(data, businessOf(req));
  }

  @Patch('tables/:id/status')
  async updateTableStatus(@Req() req: AuthedRequest, @Param('id') id: string, @Body('status') status: string) {
    return this.hospitalityService.setTableStatus(id, status, businessOf(req));
  }

  @Patch('tables/:id')
  async updateTable(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: { number?: string; capacity?: number; floor?: string | null },
  ) {
    return this.hospitalityService.updateTable(id, dto, businessOf(req));
  }

  @Delete('tables/:id')
  async deleteTable(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.deleteTable(id, businessOf(req));
  }

  @Post('tables/merge')
  async mergeTables(@Req() req: AuthedRequest, @Body() data: { tableIds: string[]; targetTableId: string }) {
    return this.hospitalityService.mergeTables(data.tableIds, data.targetTableId, businessOf(req));
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  @Post('orders')
  async createOrder(@Req() req: AuthedRequest, @Body() data: {
    offlineId: string;
    businessId?: string;
    storeId: string;
    tableId?: string;
    roomNumber?: string;
    waiterId?: string;
    roomBookingId?: string;
  }) {
    // The business comes from the token, never from the body; an order with no
    // waiter named belongs to whoever opened it.
    return this.hospitalityService.createOrder({
      ...data,
      businessId: businessOf(req),
      waiterId: data.waiterId || userOf(req).id,
    });
  }

  @Post('orders/:id/items')
  async addOrderItems(@Req() req: AuthedRequest, @Param('id') id: string, @Body('items') items: Array<{
    itemId: string;
    name?: string;
    quantity: number;
    unitPriceCents?: number;
    specialInstructions?: string;
    modifiers?: Array<{ name: string; priceCents?: number } | string>;
    course?: string;
    seatNumber?: number;
  }>) {
    return this.hospitalityService.addOrderItems(id, items, businessOf(req));
  }

  @Post('orders/:id/items/remove')
  async removeOrderItems(@Req() req: AuthedRequest, @Param('id') id: string, @Body('itemIds') itemIds: string[]) {
    return this.hospitalityService.removeOrderItems(id, itemIds, businessOf(req));
  }

  @Post('orders/:id/request-bill')
  async requestBill(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.requestBill(id, businessOf(req));
  }

  /** Cancel an order and reset the table to AVAILABLE (guests left without ordering) */
  @Post('orders/:id/cancel')
  async cancelOrder(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.cancelOrder(id, businessOf(req));
  }

  @Get('orders/:id')
  async getOrderDetails(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.getOrderDetails(id, businessOf(req));
  }

  @Get('kitchen/orders')
  async getKitchenOrders(@Req() req: AuthedRequest, @Query('storeId') storeId: string) {
    return this.hospitalityService.getKitchenOrders(storeId, businessOf(req));
  }

  @Post('orders/:id/split')
  async splitBill(@Req() req: AuthedRequest, @Param('id') id: string, @Body('splits') splits: Array<{ itemIds: string[] }>) {
    return this.hospitalityService.splitBill(id, splits, businessOf(req));
  }

  @Post('orders/:id/transfer')
  async transferTable(@Req() req: AuthedRequest, @Param('id') id: string, @Body('newTableId') newTableId: string) {
    return this.hospitalityService.transferTable(id, newTableId, businessOf(req));
  }

  // ── Course / Fire Management ───────────────────────────────────────────────

  @Post('orders/:id/fire-course')
  async fireCourse(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { course: string }) {
    return this.hospitalityService.fireCourse(id, body.course, businessOf(req));
  }

  // ── Reservations ──────────────────────────────────────────────────────────

  @Post('reservations')
  async createReservation(@Req() req: AuthedRequest, @Body() data: {
    tableId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    reservationTime: string;
    duration?: number;
    notes?: string;
    depositCents?: number;
  }) {
    return this.hospitalityService.createReservation({
      ...data,
      reservationTime: new Date(data.reservationTime),
    }, businessOf(req));
  }

  @Get('reservations')
  async getReservations(@Req() req: AuthedRequest, @Query('storeId') storeId: string, @Query('date') date?: string) {
    return this.hospitalityService.getReservations(storeId, businessOf(req), date ? new Date(date) : undefined);
  }

  @Get('reservations/:id/deposit-status')
  async getReservationDepositStatus(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.getReservationDepositStatus(id, businessOf(req));
  }

  // ── Kitchen tickets ────────────────────────────────────────────────────────

  @Post('orders/:id/kot')
  async createKOT(@Req() req: AuthedRequest, @Param('id') id: string, @Body('type') type: string, @Body('itemIds') itemIds?: string[]) {
    return this.hospitalityService.createKOT(id, type, itemIds, businessOf(req));
  }

  @Patch('kot/:id/status')
  async updateKOTStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: AuthedRequest,
  ) {
    return this.hospitalityService.updateKOTStatus(id, status, req.user?.id, businessOf(req));
  }

  @Patch('orders/:id/priority')
  async setOrderPriority(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { priority: number; isVIP: boolean },
  ) {
    return this.hospitalityService.setOrderPriority(id, body.priority, body.isVIP, businessOf(req));
  }

  @Get('kds/orders')
  async getKDSOrders(@Req() req: AuthedRequest, @Query('storeId') storeId: string, @Query('station') station?: string) {
    return this.hospitalityService.getKDSOrders(storeId, businessOf(req), station);
  }

  // ── Bar Tab Endpoints ──────────────────────────────────────────────────────

  @Get('bar-tabs')
  getBarTabs(@Req() req: AuthedRequest, @Query('storeId') storeId: string) {
    return this.hospitalityService.getBarTabs(businessOf(req), storeId);
  }

  @Post('bar-tabs')
  createBarTab(@Req() req: AuthedRequest, @Body() body: { storeId: string; tabName: string; waiterId?: string }) {
    return this.hospitalityService.createBarTab(businessOf(req), body.storeId, body.tabName, body.waiterId || userOf(req).id);
  }

  @Post('bar-tabs/:id/items')
  addToBarTab(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { items: any[] }) {
    return this.hospitalityService.addToBarTab(id, body.items, businessOf(req));
  }

  @Post('bar-tabs/:id/settle')
  settleBarTab(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { payments: any[] }) {
    return this.hospitalityService.settleBarTab(id, body.payments, businessOf(req));
  }

  @Post('bar-tabs/:id/close')
  closeBarTab(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.closeBarTab(id, businessOf(req), String(userOf(req).role));
  }

  // ── Hotel Room Endpoints ───────────────────────────────────────────────────

  @Get('hotel-rooms')
  getHotelRooms(
    @Req() req: AuthedRequest,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.hospitalityService.getHotelRooms(businessOf(req), storeId, status);
  }

  @Post('hotel-rooms')
  createHotelRoom(@Req() req: AuthedRequest, @Body() body: {
    storeId: string;
    number: string;
    type?: string;
    floor?: string;
    capacity?: number;
    pricePerNightCents?: number;
    amenities?: string[];
    notes?: string;
  }) {
    return this.hospitalityService.createHotelRoom(body, businessOf(req));
  }

  @Patch('hotel-rooms/:id')
  updateHotelRoom(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: {
      type?: string;
      floor?: string;
      capacity?: number;
      pricePerNightCents?: number;
      status?: string;
      amenities?: string[];
      notes?: string;
    },
  ) {
    return this.hospitalityService.updateHotelRoom(id, body, businessOf(req));
  }

  @Delete('hotel-rooms/:id')
  deleteHotelRoom(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.deleteHotelRoom(id, businessOf(req));
  }

  @Get('room-bookings')
  getRoomBookings(
    @Req() req: AuthedRequest,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.hospitalityService.getRoomBookings(businessOf(req), storeId, status);
  }

  @Post('room-bookings')
  createRoomBooking(@Req() req: AuthedRequest, @Body() body: {
    storeId: string;
    roomId: string;
    guestName: string;
    guestPhone?: string;
    guestIdNumber?: string;
    guestKraPin?: string;
    checkInDate: string;
    checkOutDate?: string;
    nightCount: number;
    depositCents?: number;
    depositMethod?: string;
    notes?: string;
  }) {
    return this.hospitalityService.createRoomBooking({
      ...body,
      checkInDate: new Date(body.checkInDate),
      checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : undefined,
    }, businessOf(req), this.actor(req));
  }

  /** Take a further deposit against a booking (a part-payment up front, or a top-up). */
  @Post('room-bookings/:id/deposit')
  addDeposit(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: { amountCents: number; method?: string }) {
    return this.hospitalityService.addDeposit(id, body, businessOf(req), this.actor(req));
  }

  private actor(req: AuthedRequest) {
    const u = userOf(req);
    return { id: u.id, name: u.name, role: String(u.role) };
  }

  @Post('room-bookings/:id/check-in')
  checkInGuest(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.checkInGuest(id, businessOf(req));
  }

  @Post('room-bookings/:id/check-out')
  checkOutGuest(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body('payments') payments: Array<{ method: string; amountCents: number }>,
    @Body('refundMethod') refundMethod?: string,
  ) {
    return this.hospitalityService.checkOutGuest(id, payments ?? [], businessOf(req), this.actor(req), { refundMethod });
  }

  /** What it costs to check this guest out now. The desk collects this before calling check-out. */
  @Get('room-bookings/:id/checkout-quote')
  getCheckoutQuote(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.getCheckoutQuote(id, businessOf(req));
  }

  @Post('room-bookings/:id/cancel')
  cancelRoomBooking(@Req() req: AuthedRequest, @Param('id') id: string, @Body('forfeit') forfeit?: boolean, @Body('refundMethod') refundMethod?: string) {
    return this.hospitalityService.cancelRoomBooking(id, businessOf(req), this.actor(req), { forfeit: forfeit === true, refundMethod });
  }

  // ── Guest Folio ───────────────────────────────────────────────────────────

  @Get('room-bookings/:id/folio')
  getFolio(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.getFolio(id, businessOf(req));
  }

  @Post('room-bookings/:id/folio')
  addFolioCharge(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { type: string; description: string; amountCents: number; quantity?: number },
  ) {
    return this.hospitalityService.addFolioCharge(id, body, businessOf(req), userOf(req).name, String(userOf(req).role));
  }

  @Delete('folio-charges/:id')
  removeFolioCharge(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.removeFolioCharge(id, businessOf(req));
  }

  // ── Housekeeping ──────────────────────────────────────────────────────────

  @Patch('hotel-rooms/:id/housekeeping')
  updateHousekeepingStatus(@Req() req: AuthedRequest, @Param('id') id: string, @Body('status') status: string) {
    return this.hospitalityService.updateHousekeepingStatus(id, status, businessOf(req));
  }

  @Get('housekeeping')
  getHousekeepingQueue(@Req() req: AuthedRequest, @Query('storeId') storeId: string) {
    return this.hospitalityService.getHousekeepingQueue(businessOf(req), storeId);
  }

  // ── Hotel Dashboard ────────────────────────────────────────────────────────

  @Get('hotel-dashboard')
  getHotelDashboard(@Req() req: AuthedRequest, @Query('storeId') storeId: string) {
    return this.hospitalityService.getHotelDashboard(businessOf(req), storeId);
  }

  // ── Void Single KOT Item ──────────────────────────────────────────────────

  @Patch('orders/:orderId/items/:itemId/void')
  async voidOrderItem(
    @Req() req: AuthedRequest,
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() body: { reason: string },
  ) {
    return this.hospitalityService.voidOrderItem(
      orderId, itemId, body.reason, String(req.user?.role ?? ''), req.user?.name ?? 'staff', businessOf(req),
    );
  }

  // ── Happy Hours ───────────────────────────────────────────────────────────

  @Get('happy-hours/active-discount')
  async getActiveDiscount(@Req() req: AuthedRequest) {
    return { discountPct: await this.hospitalityService.getActiveHappyHourDiscount(businessOf(req)) };
  }

  @Get('happy-hours')
  async getHappyHours(@Req() req: AuthedRequest) {
    return this.hospitalityService.getHappyHours(businessOf(req));
  }

  @Post('happy-hours')
  async createHappyHour(@Req() req: AuthedRequest, @Body() body: any) {
    return this.hospitalityService.createHappyHour(body, businessOf(req));
  }

  @Delete('happy-hours/:id')
  async deleteHappyHour(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.hospitalityService.deleteHappyHour(id, businessOf(req));
  }

  // ── RevPASH ───────────────────────────────────────────────────────────────

  @Get('revpash')
  async getRevPASH(
    @Req() req: AuthedRequest,
    @Query('storeId') storeId: string,
    @Query('date') date: string,
  ) {
    return this.hospitalityService.getRevPASH(businessOf(req), storeId, date);
  }
}
