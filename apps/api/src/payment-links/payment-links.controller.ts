import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { PaymentLinksService } from './payment-links.service';

@Controller('payments/links')
export class PaymentLinksController {
  constructor(private readonly svc: PaymentLinksService) {}

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Get()
  list(@Query('businessId') businessId: string) {
    return this.svc.list(businessId);
  }

  @Public()
  @Get(':code/public')
  getByCode(@Param('code') code: string) {
    return this.svc.getByCode(code);
  }

  @Public()
  @Post(':code/pay')
  recordPayment(@Param('code') code: string, @Body('amountCents') amountCents: number, @Body('method') method: string, @Body('reference') reference?: string) {
    return this.svc.recordPayment(code, amountCents, method, reference);
  }

  @Patch(':id/disable')
  disable(@Param('id') id: string) {
    return this.svc.disable(id);
  }
}
