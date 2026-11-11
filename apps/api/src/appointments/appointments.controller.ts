import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { BadRequestException, Controller, Delete, ForbiddenException, Get, Patch, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';
import { nairobiDay, nairobiDayEnd, nairobiDayStart } from '../common/dates';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });
const isManager = (req: Authed) => ['OWNER', 'ADMIN', 'MANAGER'].includes(String(req.user.role));
const needManager = (req: Authed) => {
  if (!isManager(req)) throw new ForbiddenException('Only a manager can do this');
};

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

  // The fixed paths below come before ':id' so they are not read as an appointment's id.

  /** Who can be booked, and their weekly hours. A manager also sees the rest of the team, to switch them on. */
  @Get('staff')
  staff(@Req() req: Authed) {
    return this.svc.listStaff(req.user.businessId, isManager(req));
  }

  /** Set a user up to take appointments, switch them off, or change their hours. */
  @Put('staff/:userId')
  saveStaff(@Param('userId') userId: string, @Body() dto: { active?: boolean; workingHours?: unknown }, @Req() req: Authed) {
    needManager(req);
    return this.svc.saveStaff(userId, dto, req.user.businessId);
  }

  /** What each stylist earned from the services they performed, between two days (default: this month so far). */
  @Get('earnings')
  earnings(@Query('from') from: string | undefined, @Query('to') to: string | undefined, @Req() req: Authed) {
    needManager(req);
    const today = nairobiDay(new Date());
    const day = (v: string | undefined, fallback: string) => {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new BadRequestException('Dates must look like 2026-11-30');
      return v ?? fallback;
    };
    const start = day(from, `${today.slice(0, 7)}-01`);
    const end = day(to, today);
    return this.svc.earnings(req.user.businessId, nairobiDayStart(start), nairobiDayEnd(end));
  }

  /** A client's notes, visits and reliability. */
  @Get('clients/:customerId')
  clientHistory(@Param('customerId') customerId: string, @Req() req: Authed) {
    return this.svc.clientHistory(customerId, req.user.businessId);
  }

  @Patch('clients/:customerId/notes')
  clientNotes(@Param('customerId') customerId: string, @Body() dto: { notes?: string }, @Req() req: Authed) {
    return this.svc.setClientNotes(customerId, dto?.notes, req.user.businessId);
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
