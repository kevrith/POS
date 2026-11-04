import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { WaitlistService } from './waitlist.service';
import { HospitalityAccessGuard } from '../hospitality/hospitality-access.guard';

type AuthedRequest = Request & { user: AuthUser };

@UseGuards(HospitalityAccessGuard)
@RequiresFeature(Feature.WAITLIST)
@Controller('hospitality/waitlist')
export class WaitlistController {
  constructor(private readonly svc: WaitlistService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('storeId') storeId: string, @Query('status') status: string) {
    return this.svc.list(req.user.businessId, storeId, status);
  }

  @Post()
  add(@Req() req: AuthedRequest, @Body() dto: {
    storeId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    notes?: string;
    estimatedWaitMinutes?: number;
  }) {
    return this.svc.add(dto, req.user.businessId);
  }

  @Patch(':id/seat')
  seat(@Req() req: AuthedRequest, @Param('id') id: string, @Body('tableId') tableId?: string) {
    return this.svc.seat(id, req.user.businessId, tableId);
  }

  @Patch(':id/notify')
  notify(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.notify(id, req.user.businessId);
  }

  @Patch(':id/cancel')
  cancel(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.cancel(id, req.user.businessId);
  }

  @Patch(':id/no-show')
  noShow(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.svc.noShow(id, req.user.businessId);
  }
}
