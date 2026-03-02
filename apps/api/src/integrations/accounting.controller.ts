import { Controller, Get, Post, Query, Body, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('integrations/accounting')
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(private accounting: AccountingService) {}

  @Get('status')
  getStatus(@Query('businessId') businessId: string) {
    return this.accounting.getAccountingStatus(businessId);
  }

  // ── QuickBooks ───────────────────────────────────────────────────────────

  @Get('quickbooks/connect')
  getQBAuthUrl(@Query('businessId') businessId: string) {
    return { url: this.accounting.getQuickBooksAuthUrl(businessId) };
  }

  @Get('quickbooks/callback')
  async qbCallback(
    @Query('code') code: string,
    @Query('realmId') realmId: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.accounting.handleQuickBooksCallback(code, realmId, state);
    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3001'}/settings?tab=integrations&connected=quickbooks`);
  }

  @Post('quickbooks/export')
  exportToQB(
    @Query('businessId') businessId: string,
    @Body() body: { startDate: string; endDate: string },
  ) {
    return this.accounting.exportToQuickBooks(businessId, new Date(body.startDate), new Date(body.endDate));
  }

  // ── Sage ─────────────────────────────────────────────────────────────────

  @Post('sage/configure')
  configureSage(
    @Query('businessId') businessId: string,
    @Body() body: { apiKey: string; companyId: string },
  ) {
    return this.accounting.configureSage(businessId, body.apiKey, body.companyId);
  }

  @Post('sage/export')
  exportToSage(
    @Query('businessId') businessId: string,
    @Body() body: { startDate: string; endDate: string },
  ) {
    return this.accounting.exportToSage(businessId, new Date(body.startDate), new Date(body.endDate));
  }
}
