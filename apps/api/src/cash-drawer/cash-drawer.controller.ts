import { Controller, Post, Get, Patch, Body, Param, Query, BadRequestException } from '@nestjs/common';
import { CashDrawerService } from './cash-drawer.service';

@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private cashDrawerService: CashDrawerService) {}

  @Post('open')
  async openSession(@Body() data: {
    businessId: string;
    storeId: string;
    cashierId: string;
    openingBalanceCents: number;
    tillNumber?: number;
  }) {
    return this.cashDrawerService.openSession(data);
  }

  @Patch(':id/close')
  async closeSession(
    @Param('id') id: string,
    @Body() data: {
      closingBalanceCents: number;
      expectedBalanceCents: number;
      notes?: string;
    }
  ) {
    return this.cashDrawerService.closeSession(id, data);
  }

  @Get('current/:cashierId/:storeId')
  async getCurrentSession(
    @Param('cashierId') cashierId: string,
    @Param('storeId') storeId: string
  ) {
    return this.cashDrawerService.getCurrentSession(cashierId, storeId);
  }

  @Get('active-sessions')
  async getActiveSessions(@Query('storeId') storeId: string, @Query('businessId') businessId?: string) {
    return this.cashDrawerService.getActiveSessions(storeId, businessId);
  }

  @Get(':id/summary')
  async getSessionSummary(@Param('id') id: string) {
    return this.cashDrawerService.getSessionSummary(id);
  }
}
