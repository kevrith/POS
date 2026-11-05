import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.APPOINTMENTS)
@Controller('appointments')
export class AppointmentsController {
  constructor(private svc: AppointmentsService) {}

  @Get()
  findAll(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.findAll(businessId, storeId, date, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.findOne(id, req.user.businessId);
  }

  @Post()
  create(@Body() dto: any, @Req() req: Authed) {
    return this.svc.create({ ...dto, businessId: req.user.businessId }, actorOf(req));
  }

  /** Take (a further) deposit. */
  @Post(':id/deposit')
  addDeposit(@Param('id') id: string, @Body() dto: { amountCents: number; method?: string }, @Req() req: Authed) {
    return this.svc.addDeposit(id, dto, req.user.businessId, actorOf(req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Req() req: Authed) {
    return this.svc.update(id, req.user.businessId, dto, actorOf(req));
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.delete(id, req.user.businessId);
  }
}
