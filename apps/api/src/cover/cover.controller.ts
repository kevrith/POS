import { Feature } from '@pos/shared';
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { CoverService } from './cover.service';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('cover')
export class CoverController {
  constructor(private svc: CoverService) {}

  @Post('checks')
  record(@Body() dto: { patientId?: string; providerId?: string; memberNumber?: string; status?: string; reference?: string; notes?: string; visitId?: string }, @Req() req: Authed) {
    return this.svc.recordCheck(req.user.businessId, dto ?? {}, { id: req.user.id, name: req.user.name });
  }

  @Get('checks')
  checks(@Query('patientId') patientId: string, @Req() req: Authed) {
    return this.svc.checks(req.user.businessId, patientId);
  }

  @Get('standing')
  standing(@Query('visitId') visitId: string, @Query('providerId') providerId: string, @Query('memberNumber') memberNumber: string, @Req() req: Authed) {
    return this.svc.standingForVisit(req.user.businessId, visitId, providerId, memberNumber ?? '');
  }

  // Fixed paths before ':id'.
  @Get('claims/aging')
  aging(@Req() req: Authed) {
    return this.svc.aging(req.user.businessId);
  }

  @Get('claims')
  claims(@Query('status') status: string | undefined, @Query('providerId') providerId: string | undefined, @Query('q') q: string | undefined, @Query('ready') ready: string | undefined, @Req() req: Authed) {
    return this.svc.claims(req.user.businessId, { status, providerId, q, readyOnly: ready === '1' });
  }

  @Post('claims/:id/resubmit')
  resubmit(@Param('id') id: string, @Body() dto: { memberNumber?: string; preauthNumber?: string; diagnoses?: unknown }, @Req() req: Authed) {
    return this.svc.resubmit(req.user.businessId, id, dto ?? {});
  }

  @Get('claims/:id')
  claim(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.claim(req.user.businessId, id);
  }
}
