import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/jwt-auth.guard';
import { ChannelManagerService } from './channel-manager.service';
import { ApiKeyGuard } from '../api-keys/api-key.guard';

/** An API key may post channel bookings only if it was issued with this scope. */
export const CHANNEL_WRITE_SCOPE = 'bookings:write';

@Controller('integrations/channel')
export class ChannelManagerController {
  constructor(private readonly svc: ChannelManagerService) {}

  /**
   * Called by the booking channel, not by a signed-in user, so it skips the JWT guard, but it is not open:
   * the sender must present an API key (x-api-key) carrying the bookings:write scope. The business is the
   * key's business. A businessId in the query string used to be believed, which let anyone create or
   * overwrite bookings in any business.
   */
  @Public()
  @UseGuards(ApiKeyGuard)
  @Post('webhook/:channel')
  webhook(
    @Param('channel') channel: string,
    @Body() payload: any,
    @Query('storeId') storeId: string,
    @Req() req: Request & { apiKey: { businessId: string; scopes: string[] } },
  ) {
    if (!req.apiKey.scopes.includes(CHANNEL_WRITE_SCOPE)) {
      throw new ForbiddenException(`This API key needs the ${CHANNEL_WRITE_SCOPE} scope`);
    }
    return this.svc.receiveWebhook(channel, payload, req.apiKey.businessId, storeId);
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
