import { Controller, Get, Post, Patch, Body, Param, Query } from '@nestjs/common';
import { RFQService } from './rfq.service';

@Controller('suppliers/rfq')
export class RFQController {
  constructor(private readonly svc: RFQService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('status') status: string) {
    return this.svc.list(businessId, status);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/send')
  send(@Param('id') id: string) {
    return this.svc.send(id);
  }

  @Post(':id/responses')
  addResponse(@Param('id') rfqId: string, @Body() dto: any) {
    return this.svc.addResponse(rfqId, dto);
  }

  @Patch(':id/responses/:rid/award')
  awardResponse(@Param('id') rfqId: string, @Param('rid') responseId: string) {
    return this.svc.awardResponse(rfqId, responseId);
  }

  @Get(':id/comparison')
  getComparison(@Param('id') rfqId: string) {
    return this.svc.getComparison(rfqId);
  }
}
