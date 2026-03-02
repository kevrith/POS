import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { PortalService } from './portal.service';

// Public endpoints — no JWT required (customer self-service portal)
@Public()
@SkipSubscriptionCheck()
@Controller('portal')
export class PortalController {
  constructor(private svc: PortalService) {}

  @Get('menu')
  getMenu(@Query('businessId') businessId: string) {
    return this.svc.getMenu(businessId);
  }

  @Post('loyalty-lookup')
  loyaltyLookup(@Body() body: { phone: string; businessId: string }) {
    return this.svc.loyaltyLookup(body.phone, body.businessId);
  }

  @Post('order')
  placeOrder(@Body() body: {
    businessId: string;
    customerName: string;
    phone: string;
    address: string;
    items: Array<{ name: string; quantity: number; priceCents: number }>;
    orderType: 'DELIVERY' | 'PICKUP';
    notes?: string;
  }) {
    return this.svc.placeOrder(body);
  }

  @Get('orders')
  getOrderHistory(
    @Query('phone') phone: string,
    @Query('businessId') businessId: string,
  ) {
    return this.svc.getOrderHistory(phone, businessId);
  }
}
