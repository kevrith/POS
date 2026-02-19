import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { HospitalityService } from './hospitality.service';

@Controller('hospitality')
export class HospitalityController {
  constructor(private hospitalityService: HospitalityService) {}

  @Get('tables')
  async getTables(@Query('storeId') storeId: string, @Query('status') status?: string) {
    return this.hospitalityService.getTables(storeId, status);
  }

  @Patch('tables/:id/status')
  async updateTableStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.hospitalityService.updateTableStatus(id, status);
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

  @Delete('orders/:id/items')
  async removeOrderItems(@Param('id') id: string, @Body('itemIds') itemIds: string[]) {
    return this.hospitalityService.removeOrderItems(id, itemIds);
  }

  @Post('orders/:id/request-bill')
  async requestBill(@Param('id') id: string) {
    return this.hospitalityService.requestBill(id);
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
  async updateKOTStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.hospitalityService.updateKOTStatus(id, status);
  }

  @Get('kds/orders')
  async getKDSOrders(@Query('storeId') storeId: string) {
    return this.hospitalityService.getKDSOrders(storeId);
  }
}
