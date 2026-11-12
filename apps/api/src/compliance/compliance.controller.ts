import { Feature } from '@pos/shared';
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { ComplianceService } from './compliance.service';

type Authed = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('compliance')
export class ComplianceController {
  constructor(private svc: ComplianceService) {}

  @Get('controlled-register')
  controlled(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() req: Authed) {
    return this.svc.controlledRegister(req.user.businessId, { from, to });
  }

  @Get('dispensing-register')
  dispensing(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() req: Authed) {
    return this.svc.dispensingRegister(req.user.businessId, { from, to });
  }

  @Get('disposal-register')
  disposal(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() req: Authed) {
    return this.svc.disposalRegister(req.user.businessId, { from, to });
  }

  /** Everything held about one patient, for a data access request. Logged on the audit trail. */
  @Get('patients/:id/export')
  patientExport(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.patientExport(req.user.businessId, id, { id: req.user.id, name: req.user.name });
  }
}
