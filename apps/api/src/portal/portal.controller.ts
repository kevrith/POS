import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
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

  /** Customer pays for their order via M-Pesa STK push (prompt to their phone). */
  @Post('pay-order')
  payOrder(@Body() body: { phone: string; amountCents: number; reference: string }) {
    return this.svc.payOrder(body);
  }

  /** Poll STK status: { status: 'pending' | 'paid' | 'failed' }. */
  @Get('pay-status/:checkoutRequestId')
  payStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    return this.svc.payStatus(checkoutRequestId);
  }

  /** Confirm an M-Pesa payment for an order → marks PAID + reconciles into a Sale. */
  @Post('order/:id/confirm-payment')
  confirmPayment(
    @Param('id') id: string,
    @Body() body: { checkoutRequestId: string },
  ) {
    return this.svc.confirmPayment(id, body.checkoutRequestId);
  }

  /** Customer self-service table reservation (auto-assigns a free table). */
  @Post('reserve')
  reserve(@Body() body: {
    businessId: string;
    customerName: string;
    phone?: string;
    partySize: number;
    reservationTime: string;
    notes?: string;
  }) {
    return this.svc.reserveTable(body);
  }
}
