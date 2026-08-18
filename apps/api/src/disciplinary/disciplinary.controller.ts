import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { DisciplinaryService } from './disciplinary.service';

@RequiresFeature(Feature.HR_BASIC)
@Controller('hr/disciplinary')
export class DisciplinaryController {
  constructor(private readonly svc: DisciplinaryService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('employeeId') employeeId: string) {
    return this.svc.list(businessId, employeeId);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/acknowledge')
  acknowledge(@Param('id') id: string) {
    return this.svc.acknowledge(id);
  }
}
