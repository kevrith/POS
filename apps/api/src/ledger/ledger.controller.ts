import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { LedgerService } from './ledger.service';

@RequiresFeature(Feature.LEDGER)
@Controller('accounting/journal')
export class LedgerController {
  constructor(private readonly svc: LedgerService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string, @Query('status') status: string) {
    return this.svc.list(businessId, startDate, endDate, status);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/post')
  post(@Param('id') id: string, @Body('postedBy') postedBy: string) {
    return this.svc.post(id, postedBy);
  }

  @Patch(':id/reverse')
  reverse(@Param('id') id: string, @Body('reversedBy') reversedBy: string) {
    return this.svc.reverse(id, reversedBy);
  }

  @Get('trial-balance')
  trialBalance(@Query('businessId') businessId: string, @Query('asOfDate') asOfDate: string) {
    return this.svc.trialBalance(businessId, asOfDate);
  }
}
