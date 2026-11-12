import { Feature } from '@pos/shared';
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { ClinicReportsService } from './clinic-reports.service';

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('clinic/reports')
export class ClinicReportsController {
  constructor(private svc: ClinicReportsService) {}

  /** The clinic's figures for a period (default: the last 30 days). */
  @Get('summary')
  summary(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Query('storeId') storeId: string | undefined, @Req() req: Request & { user: AuthUser }) {
    return this.svc.summary(req.user.businessId, { from, to, storeId });
  }
}
