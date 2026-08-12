import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CashDrawerService } from './cash-drawer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private cashDrawerService: CashDrawerService) {}

  @Post('open')
  async openSession(
    @Body()
    data: {
      businessId?: string;
      storeId: string;
      cashierId?: string;
      openingBalanceCents: number;
      tillNumber?: number;
    },
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.cashDrawerService.openSession({
      ...data,
      businessId: req.user.businessId,
      cashierId: data.cashierId ?? req.user.id,
    });
  }

  @Patch(':id/close')
  async closeSession(
    @Param('id') id: string,
    @Body()
    data: {
      closingBalanceCents: number;
      expectedBalanceCents?: number;
      notes?: string;
    },
  ) {
    return this.cashDrawerService.closeSession(id, data);
  }

  @Get('current/:cashierId/:storeId')
  async getCurrentSession(
    @Param('cashierId') cashierId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.cashDrawerService.getCurrentSession(cashierId, storeId);
  }

  @Get('active-sessions')
  async getActiveSessions(
    @Query('storeId') storeId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.cashDrawerService.getActiveSessions(storeId, req.user.businessId);
  }

  @Get(':id/summary')
  async getSessionSummary(@Param('id') id: string) {
    return this.cashDrawerService.getSessionSummary(id);
  }
}
