import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrescriptionsService } from './prescriptions.service';

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private svc: PrescriptionsService) {}

  @Get()
  findAll(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('status') status?: string,
  ) {
    return this.svc.findAll(businessId, storeId, status);
  }

  @Get('refill-queue')
  refillQueue(@Query('businessId') businessId: string) {
    return this.svc.getRefillQueue(businessId);
  }

  @Get('controlled-log')
  controlledLog(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getControlledLog(businessId, startDate, endDate);
  }

  @Post('check-interactions')
  checkInteractions(@Body() body: { businessId: string; drugNames: string[] }) {
    return this.svc.checkInteractions(body.businessId, body.drugNames);
  }

  @Post('controlled-log')
  addControlledLog(@Body() dto: any) {
    return this.svc.addControlledLog(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/dispense')
  dispense(@Param('id') id: string, @Body() body: { dispensedBy: string }) {
    return this.svc.dispense(id, body.dispensedBy);
  }

  @Patch(':id/refill')
  refill(@Param('id') id: string, @Body() body: { dispensedBy: string }) {
    return this.svc.refill(id, body.dispensedBy);
  }

  @Patch(':id/refer')
  refer(@Param('id') id: string, @Body() body: { referralNotes: string }) {
    return this.svc.refer(id, body.referralNotes);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }
}
