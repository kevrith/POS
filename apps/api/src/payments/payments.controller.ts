import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('payments')
export class PaymentsController {
  constructor(private mpesa: MpesaService) {}

  @Post('mpesa/stk-push')
  @UseGuards(JwtAuthGuard)
  @Throttle({ mpesa: { limit: 5, ttl: 60000 } })
  async stkPush(@Body() body: { phone: string; amountCents: number; reference: string }) {
    return this.mpesa.initiateSTKPush({
      phone: body.phone,
      amountCents: body.amountCents,
      accountReference: body.reference,
    });
  }

  @Get('mpesa/stk-status/:checkoutRequestId')
  @UseGuards(JwtAuthGuard)
  async stkStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    return this.mpesa.querySTKStatus(checkoutRequestId);
  }

  /** Safaricom calls this endpoint after payment attempt */
  @Post('mpesa/callback')
  async mpesaCallback(@Body() body: unknown) {
    await this.mpesa.handleCallback(body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  @Post('card')
  @UseGuards(JwtAuthGuard)
  async cardPayment(@Body() body: { amountCents: number }) {
    return {
      success: true,
      reference: `CARD-${Date.now()}`,
      amountCents: body.amountCents,
    };
  }
}
