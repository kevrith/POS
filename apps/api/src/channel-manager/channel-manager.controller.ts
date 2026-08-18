import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { ChannelManagerService } from './channel-manager.service';

@Controller('integrations/channel')
export class ChannelManagerController {
  constructor(private readonly svc: ChannelManagerService) {}

  @Public()
  @Post('webhook/:channel')
  webhook(
    @Param('channel') channel: string,
    @Body() payload: any,
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.svc.receiveWebhook(channel, payload, businessId, storeId);
  }

  @RequiresFeature(Feature.CHANNEL_MANAGER)
  @Get('bookings')
  list(@Query('businessId') businessId: string, @Query('status') status: string) {
    return this.svc.list(businessId, status);
  }

  @RequiresFeature(Feature.CHANNEL_MANAGER)
  @Patch('bookings/:id/assign-room')
  assignRoom(@Param('id') id: string, @Body('roomBookingId') roomBookingId: string) {
    return this.svc.assignRoom(id, roomBookingId);
  }

  @RequiresFeature(Feature.CHANNEL_MANAGER)
  @Patch('bookings/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.svc.updateStatus(id, status);
  }

  @RequiresFeature(Feature.CHANNEL_MANAGER)
  @Post('sync')
  syncFromChannel(@Query('businessId') businessId: string, @Query('channel') channel: string) {
    return this.svc.syncFromChannel(businessId, channel);
  }
}
