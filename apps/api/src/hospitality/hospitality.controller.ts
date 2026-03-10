import { Controller, Post, Get, Patch, Delete, Body, Param, Query, Req, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { HospitalityService } from './hospitality.service';

@Controller('hospitality')
export class HospitalityController {
  constructor(private hospitalityService: HospitalityService) {}

  @Get('tables')
  async getTables(@Query('storeId') storeId: string, @Query('status') status?: string) {
    return this.hospitalityService.getTables(storeId, status);
  }

  @Post('tables')
  async createTable(@Body() data: { storeId: string; number: string; capacity: number; floor?: string }) {
    return this.hospitalityService.createTable(data);
  }

  @Patch('tables/:id/status')
  async updateTableStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.hospitalityService.updateTableStatus(id, status);
  }

  @Patch('tables/:id')
  async updateTable(
    @Param('id') id: string,
    @Body() dto: { number?: string; capacity?: number; floor?: string | null },
  ) {
    return this.hospitalityService.updateTable(id, dto);
  }

  @Delete('tables/:id')
  async deleteTable(@Param('id') id: string) {
    return this.hospitalityService.deleteTable(id);
  }

  @Post('orders')
  async createOrder(@Body() data: {
    offlineId: string;
    businessId: string;
    storeId: string;
    tableId?: string;
    roomNumber?: string;
    waiterId: string;
  }) {
    return this.hospitalityService.createOrder(data);
  }

  @Post('orders/:id/items')
  async addOrderItems(@Param('id') id: string, @Body('items') items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    specialInstructions?: string;
    modifiers?: string[];
  }>) {
    return this.hospitalityService.addOrderItems(id, items);
  }

  @Post('orders/:id/items/remove')
  async removeOrderItems(@Param('id') id: string, @Body('itemIds') itemIds: string[]) {
    return this.hospitalityService.removeOrderItems(id, itemIds);
  }

  @Post('orders/:id/request-bill')
  async requestBill(@Param('id') id: string) {
    return this.hospitalityService.requestBill(id);
  }

  /** Cancel an order and reset the table to AVAILABLE (guests left without ordering) */
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string) {
    return this.hospitalityService.cancelOrder(id);
  }

  @Get('orders/:id')
  async getOrderDetails(@Param('id') id: string) {
    return this.hospitalityService.getOrderDetails(id);
  }

  @Get('kitchen/orders')
  async getKitchenOrders(@Query('storeId') storeId: string) {
    return this.hospitalityService.getKitchenOrders(storeId);
  }

  @Post('tables/merge')
  async mergeTables(@Body() data: { tableIds: string[]; targetTableId: string }) {
    return this.hospitalityService.mergeTables(data.tableIds, data.targetTableId);
  }

  @Post('orders/:id/split')
  async splitBill(@Param('id') id: string, @Body('splits') splits: Array<{ itemIds: string[] }>) {
    return this.hospitalityService.splitBill(id, splits);
  }

  @Post('orders/:id/transfer')
  async transferTable(@Param('id') id: string, @Body('newTableId') newTableId: string) {
    return this.hospitalityService.transferTable(id, newTableId);
  }

  @Post('reservations')
  async createReservation(@Body() data: {
    tableId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    reservationTime: string;
    duration?: number;
    notes?: string;
  }) {
    return this.hospitalityService.createReservation({
      ...data,
      reservationTime: new Date(data.reservationTime),
    });
  }

  @Get('reservations')
  async getReservations(@Query('storeId') storeId: string, @Query('date') date?: string) {
    return this.hospitalityService.getReservations(storeId, date ? new Date(date) : undefined);
  }

  @Post('orders/:id/kot')
  async createKOT(@Param('id') id: string, @Body('type') type: string) {
    return this.hospitalityService.createKOT(id, type);
  }

  @Patch('kot/:id/status')
  async updateKOTStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const chefId = req.user?.id;
    return this.hospitalityService.updateKOTStatus(id, status, chefId);
  }

  @Patch('orders/:id/priority')
  async setOrderPriority(
    @Param('id') id: string,
    @Body() body: { priority: number; isVIP: boolean },
  ) {
    return this.hospitalityService.setOrderPriority(id, body.priority, body.isVIP);
  }

  @Get('kds/orders')
  async getKDSOrders(@Query('storeId') storeId: string) {
    return this.hospitalityService.getKDSOrders(storeId);
  }

  // ── Bar Tab Endpoints ──────────────────────────────────────────────────────

  @Get('bar-tabs')
  getBarTabs(@Query('businessId') businessId: string, @Query('storeId') storeId: string) {
    return this.hospitalityService.getBarTabs(businessId, storeId);
  }

  @Post('bar-tabs')
  createBarTab(@Body() body: { businessId: string; storeId: string; tabName: string; waiterId: string }) {
    return this.hospitalityService.createBarTab(body.businessId, body.storeId, body.tabName, body.waiterId);
  }

  @Post('bar-tabs/:id/items')
  addToBarTab(@Param('id') id: string, @Body() body: { items: any[] }) {
    return this.hospitalityService.addToBarTab(id, body.items);
  }

  @Post('bar-tabs/:id/settle')
  settleBarTab(@Param('id') id: string, @Body() body: { payments: any[] }) {
    return this.hospitalityService.settleBarTab(id, body.payments);
  }

  @Post('bar-tabs/:id/close')
  closeBarTab(@Param('id') id: string) {
    return this.hospitalityService.closeBarTab(id);
  }

  // ── Hotel Room Endpoints ───────────────────────────────────────────────────

  @Get('hotel-rooms')
  getHotelRooms(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.hospitalityService.getHotelRooms(businessId, storeId, status);
  }

  @Post('hotel-rooms')
  createHotelRoom(@Body() body: {
    businessId: string;
    storeId: string;
    number: string;
    type?: string;
    floor?: string;
    capacity?: number;
    pricePerNightCents?: number;
    amenities?: string[];
    notes?: string;
  }) {
    return this.hospitalityService.createHotelRoom(body);
  }

  @Patch('hotel-rooms/:id')
  updateHotelRoom(
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
    return this.hospitalityService.updateHotelRoom(id, body);
  }

  @Delete('hotel-rooms/:id')
  deleteHotelRoom(@Param('id') id: string) {
    return this.hospitalityService.deleteHotelRoom(id);
  }

  @Get('room-bookings')
  getRoomBookings(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.hospitalityService.getRoomBookings(businessId, storeId, status);
  }

  @Post('room-bookings')
  createRoomBooking(@Body() body: {
    businessId: string;
    storeId: string;
    roomId: string;
    guestName: string;
    guestPhone?: string;
    guestIdNumber?: string;
    checkInDate: string;
    checkOutDate?: string;
    nightCount: number;
    depositCents?: number;
    notes?: string;
  }) {
    return this.hospitalityService.createRoomBooking({
      ...body,
      checkInDate: new Date(body.checkInDate),
      checkOutDate: body.checkOutDate ? new Date(body.checkOutDate) : undefined,
    });
  }

  @Post('room-bookings/:id/check-in')
  checkInGuest(@Param('id') id: string) {
    return this.hospitalityService.checkInGuest(id);
  }

  @Post('room-bookings/:id/check-out')
  checkOutGuest(@Param('id') id: string, @Body('payments') payments: Array<{ method: string; amountCents: number }>) {
    return this.hospitalityService.checkOutGuest(id, payments ?? []);
  }

  @Post('room-bookings/:id/cancel')
  cancelRoomBooking(@Param('id') id: string) {
    return this.hospitalityService.cancelRoomBooking(id);
  }
}
