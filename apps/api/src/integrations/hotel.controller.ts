import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@RequiresFeature(Feature.HOTEL)
@Controller('integrations/hotel')
@UseGuards(JwtAuthGuard)
export class HotelController {
  constructor(private readonly hotelService: HotelService) {}

  @Get('rooms')
  getRooms(
    @Query('businessId') businessId: string,
    @Query('status') status: string,
  ) {
    return this.hotelService.getRooms(businessId, status);
  }

  @Post('room-charge')
  recordRoomCharge(
    @Body()
    body: {
      businessId: string;
      roomNumber: string;
      saleId: string;
      amountCents: number;
    },
  ) {
    return this.hotelService.recordRoomCharge(
      body.businessId,
      body.roomNumber,
      body.saleId,
      body.amountCents,
    );
  }

  @Post('menu-push')
  pushMenu(@Query('businessId') businessId: string) {
    return this.hotelService.pushMenu(businessId);
  }
}
