import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';

@RequiresFeature(Feature.HOTEL)
@Controller('hospitality/housekeeping-assignments')
export class HousekeepingController {
  constructor(private readonly svc: HousekeepingService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('status') status: string) {
    return this.svc.list(businessId, status);
  }

  @Post()
  assign(@Body() dto: any) {
    return this.svc.assign(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateStatus(id, status);
  }
}
