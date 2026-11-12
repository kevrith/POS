import { Feature } from '@pos/shared';
import { Body, Controller, Delete, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequiresFeature } from '../../auth/subscription.guard';
import { ShaService } from './sha.service';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('cover/sha')
export class ShaController {
  constructor(private svc: ShaService) {}

  @Get('status')
  status(@Req() req: Authed) {
    return this.svc.status(req.user.businessId);
  }

  @Get('config')
  config(@Req() req: Authed) {
    return this.svc.getConfig(req.user.businessId);
  }

  @Put('config')
  save(@Body() dto: Record<string, unknown>, @Req() req: Authed) {
    return this.svc.saveConfig(req.user.businessId, dto ?? {}, { id: req.user.id, name: req.user.name });
  }

  @Delete('config')
  remove(@Req() req: Authed) {
    return this.svc.removeConfig(req.user.businessId);
  }

  @Post('test')
  test(@Req() req: Authed) {
    return this.svc.test(req.user.businessId);
  }

  @Post('eligibility')
  eligibility(@Body() dto: { patientId?: string; providerId?: string; visitId?: string; identificationType?: string; identificationNumber?: string }, @Req() req: Authed) {
    return this.svc.checkEligibility(req.user.businessId, dto ?? {}, { id: req.user.id, name: req.user.name });
  }
}
