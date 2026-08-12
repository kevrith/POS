import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { PaymentLinksService } from './payment-links.service';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

@Controller('payments/links')
export class PaymentLinksController {
  constructor(private readonly svc: PaymentLinksService) {}

  // ── Merchant-facing ─────────────────────────────────────────────────────────

  @UseGuards(TenantGuard)
  @Post()
  create(
    @Body()
    dto: {
      businessId?: string;
      storeId?: string;
      description?: string;
      amountCents?: number;
      currency?: string;
      expiresAt?: string;
      maxUses?: number;
      createdBy?: string;
    },
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.create({
      ...dto,
      businessId: req.user.businessId,
      createdBy: dto.createdBy ?? req.user.id,
    });
  }

  @UseGuards(TenantGuard)
  @Get()
  list(@Req() req: Request & { user: AuthUser }) {
    return this.svc.list(req.user.businessId);
  }

  @UseGuards(TenantGuard)
  @Patch(':id/disable')
  disable(@Param('id') id: string, @Req() req: Request & { user: AuthUser }) {
    return this.svc.disable(id, req.user.businessId);
  }

  // ── Public checkout (no auth — this is the link the customer opens) ─────────
  //
  // Two path shapes exist because the merchant UI and the checkout page were
  // written against different ones. Both delegate here so there is a single
  // implementation behind them.

  @Public()
  @SkipSubscriptionCheck()
  @Get('public/:code')
  getPublicByCode(@Param('code') code: string) {
    return this.svc.getPublicView(code);
  }

  @Public()
  @SkipSubscriptionCheck()
  @Get(':code/public')
  getPublicByCodeAlias(@Param('code') code: string) {
    return this.svc.getPublicView(code);
  }

  @Public()
  @SkipSubscriptionCheck()
  @Post('public/:code/pay')
  payPublic(
    @Param('code') code: string,
    @Body() dto: { phone: string; amountCents?: number },
  ) {
    return this.svc.pay(code, dto);
  }

  @Public()
  @SkipSubscriptionCheck()
  @Post(':code/pay')
  payPublicAlias(
    @Param('code') code: string,
    @Body() dto: { phone: string; amountCents?: number },
  ) {
    return this.svc.pay(code, dto);
  }
}
