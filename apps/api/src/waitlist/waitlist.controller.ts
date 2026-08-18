import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';

@RequiresFeature(Feature.WAITLIST)
@Controller('hospitality/waitlist')
export class WaitlistController {
  constructor(private readonly svc: WaitlistService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('storeId') storeId: string, @Query('status') status: string) {
    return this.svc.list(businessId, storeId, status);
  }

  @Post()
  add(@Body() dto: any) {
    return this.svc.add(dto);
  }

  @Patch(':id/seat')
  seat(@Param('id') id: string, @Body('tableId') tableId?: string) {
    return this.svc.seat(id, tableId);
  }

  @Patch(':id/notify')
  notify(@Param('id') id: string) {
    return this.svc.notify(id);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }

  @Patch(':id/no-show')
  noShow(@Param('id') id: string) {
    return this.svc.noShow(id);
  }
}
