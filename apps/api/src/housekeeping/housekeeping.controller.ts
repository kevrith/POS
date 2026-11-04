import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { HousekeepingService } from './housekeeping.service';
import { HospitalityAccessGuard } from '../hospitality/hospitality-access.guard';

type AuthedRequest = Request & { user: AuthUser };

@UseGuards(HospitalityAccessGuard)
@RequiresFeature(Feature.HOTEL)
@Controller('hospitality/housekeeping-assignments')
export class HousekeepingController {
  constructor(private readonly svc: HousekeepingService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status: string) {
    return this.svc.list(req.user.businessId, status);
  }

  @Post()
  assign(@Req() req: AuthedRequest, @Body() dto: { roomId: string; employeeId: string; task?: string; priority?: string; notes?: string }) {
    return this.svc.assign(dto, req.user.businessId, req.user.id);
  }

  @Patch(':id/status')
  updateStatus(@Req() req: AuthedRequest, @Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateStatus(id, status, req.user.businessId);
  }
}
