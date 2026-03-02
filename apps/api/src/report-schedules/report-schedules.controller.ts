import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReportSchedulesService } from './report-schedules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('report-schedules')
export class ReportSchedulesController {
  constructor(private svc: ReportSchedulesService) {}

  @Get()
  list(@Query('businessId') businessId: string) {
    return this.svc.list(businessId);
  }

  @Post()
  create(
    @Body()
    dto: {
      businessId: string;
      reportType: string;
      frequency: string;
      hour: number;
      dayOfWeek?: number;
      dayOfMonth?: number;
      recipients: string[];
    },
  ) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: { isActive?: boolean; recipients?: string[]; hour?: number },
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/trigger')
  trigger(@Param('id') id: string) {
    return this.svc.markSent(id);
  }
}
