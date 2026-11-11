import { Feature } from '@pos/shared';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { PatientsService } from './patients.service';
import type { PatientInput } from './patient-data';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('patients')
export class PatientsController {
  constructor(private svc: PatientsService) {}

  @Get()
  list(@Query('q') q: string | undefined, @Query('limit') limit: string | undefined, @Query('includeInactive') inactive: string | undefined, @Req() req: Authed) {
    return this.svc.list(req.user.businessId, { q, limit: limit ? Number(limit) : undefined, includeInactive: inactive === 'true' });
  }

  // Fixed paths before ':id' so they are not read as a patient's id.
  @Get('match')
  match(@Query('name') name: string | undefined, @Query('phone') phone: string | undefined, @Query('idNumber') idNumber: string | undefined, @Req() req: Authed) {
    return this.svc.possibleMatches(req.user.businessId, { name, phone, idNumber });
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.get(id, req.user.businessId);
  }

  @Post()
  create(@Body() dto: PatientInput, @Req() req: Authed) {
    return this.svc.create(req.user.businessId, dto ?? {});
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: PatientInput, @Req() req: Authed) {
    return this.svc.update(id, req.user.businessId, dto ?? {});
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('active') active: boolean, @Req() req: Authed) {
    return this.svc.setActive(id, req.user.businessId, active !== false);
  }

  @Get(':id/unlinked-history')
  unlinked(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.unlinkedHistory(id, req.user.businessId);
  }

  @Post(':id/adopt-prescriptions')
  adopt(@Param('id') id: string, @Body('prescriptionIds') ids: string[], @Req() req: Authed) {
    return this.svc.adoptPrescriptions(id, req.user.businessId, ids);
  }
}
