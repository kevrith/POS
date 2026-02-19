import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private transfersService: TransfersService) {}

  @Post()
  async createTransfer(@Body() data: {
    offlineId: string;
    businessId: string;
    fromStoreId: string;
    toStoreId: string;
    initiatedBy: string;
    items: Array<{ itemId: string; quantity: number }>;
    notes?: string;
  }) {
    return this.transfersService.createTransfer(data);
  }

  @Patch(':id/receive')
  async receiveTransfer(@Param('id') id: string, @Body('receivedBy') receivedBy: string) {
    return this.transfersService.receiveTransfer(id, receivedBy);
  }

  @Patch(':id/cancel')
  async cancelTransfer(@Param('id') id: string) {
    return this.transfersService.cancelTransfer(id);
  }

  @Get(':id')
  async getTransferDetails(@Param('id') id: string) {
    return this.transfersService.getTransferDetails(id);
  }

  @Get()
  async getTransfers(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string
  ) {
    return this.transfersService.getTransfers(businessId, storeId, status);
  }

  @Get('inventory/consolidated')
  async getConsolidatedInventory(
    @Query('businessId') businessId: string,
    @Query('itemId') itemId?: string
  ) {
    return this.transfersService.getConsolidatedInventory(businessId, itemId);
  }
}
