import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrescriptionsService, type FillOptions } from './prescriptions.service';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });
/** Only the fields a fill uses; anything else in the body (the old screens sent `dispensedBy`) is ignored. */
const fillOptions = (b?: FillOptions): FillOptions => ({ payments: b?.payments, insurance: b?.insurance, buyerKraPin: b?.buyerKraPin });

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
  refillQueue(@Req() req: Authed) {
    return this.svc.getRefillQueue(req.user.businessId);
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
  checkInteractions(@Body() body: { drugNames: string[] }, @Req() req: Authed) {
    return this.svc.checkInteractions(req.user.businessId, body?.drugNames);
  }

  @Post('controlled-log')
  addControlledLog(@Body() dto: any, @Req() req: Authed) {
    // Who dispensed it is whoever is signed in, not a name typed into the request.
    return this.svc.addControlledLog({ ...dto, businessId: req.user.businessId }, actorOf(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.findOne(id, req.user.businessId);
  }

  @Post()
  create(@Body() dto: any, @Req() req: Authed) {
    return this.svc.create({ ...dto, businessId: req.user.businessId });
  }

  /** What the next fill costs, for the pharmacist to collect against. */
  @Get(':id/quote')
  quote(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.quote(id, req.user.businessId);
  }

  @Patch(':id/dispense')
  dispense(@Param('id') id: string, @Body() body: FillOptions | undefined, @Req() req: Authed) {
    return this.svc.dispense(id, req.user.businessId, actorOf(req), fillOptions(body));
  }

  @Patch(':id/refill')
  refill(@Param('id') id: string, @Body() body: FillOptions | undefined, @Req() req: Authed) {
    return this.svc.refill(id, req.user.businessId, actorOf(req), fillOptions(body));
  }

  @Patch(':id/refer')
  refer(@Param('id') id: string, @Body() body: { referralNotes: string }, @Req() req: Authed) {
    return this.svc.refer(id, req.user.businessId, body?.referralNotes);
  }

  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason: string | undefined, @Req() req: Authed) {
    return this.svc.cancel(id, req.user.businessId, reason);
  }
}
