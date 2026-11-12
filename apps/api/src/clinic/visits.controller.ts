import { Feature } from '@pos/shared';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { searchDiagnoses } from './diagnosis-codes';
import { VisitsService, type ConsultationInput } from './visits.service';
import type { VitalsInput } from './vitals';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('visits')
export class VisitsController {
  constructor(private svc: VisitsService) {}

  /** The queue board for a store. */
  @Get()
  board(@Query('storeId') storeId: string, @Req() req: Authed) {
    return this.svc.board(req.user.businessId, storeId);
  }

  // Fixed paths before ':id'.
  @Get('diagnoses')
  diagnoses(@Query('q') q?: string) {
    return searchDiagnoses(q ?? '');
  }

  /** Patients whose follow-up is due, to be reached. */
  @Get('follow-ups')
  followUps(@Query('storeId') storeId: string | undefined, @Req() req: Authed) {
    return this.svc.followUps(req.user.businessId, storeId);
  }

  @Post(':id/follow-up/contacted')
  followUpContacted(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.markFollowUpContacted(id, req.user.businessId, actorOf(req));
  }

  @Post(':id/follow-up/remind')
  followUpRemind(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.remindFollowUp(id, req.user.businessId, actorOf(req));
  }

  @Get('patient/:patientId')
  history(@Param('patientId') patientId: string, @Req() req: Authed) {
    return this.svc.history(patientId, req.user.businessId);
  }

  /** A booked patient has arrived: queue them from their appointment. */
  @Post('from-appointment/:appointmentId')
  fromAppointment(@Param('appointmentId') appointmentId: string, @Body() dto: { patientId?: string; complaint?: string }, @Req() req: Authed) {
    return this.svc.createFromAppointment(req.user.businessId, appointmentId, dto ?? {}, actorOf(req));
  }

  @Post()
  create(@Body() dto: { storeId?: string; patientId?: string; complaint?: string; priority?: string; appointmentId?: string }, @Req() req: Authed) {
    return this.svc.create(req.user.businessId, dto?.storeId ?? req.user.storeId ?? '', dto ?? {}, actorOf(req));
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.get(id, req.user.businessId);
  }

  @Patch(':id/vitals')
  vitals(@Param('id') id: string, @Body() dto: VitalsInput, @Req() req: Authed) {
    return this.svc.saveVitals(id, req.user.businessId, dto, actorOf(req));
  }

  @Post(':id/start')
  start(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.start(id, req.user.businessId, actorOf(req));
  }

  @Patch(':id/consultation')
  consultation(@Param('id') id: string, @Body() dto: ConsultationInput, @Req() req: Authed) {
    return this.svc.saveConsultation(id, req.user.businessId, dto, actorOf(req));
  }

  @Post(':id/finish')
  finish(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.finish(id, req.user.businessId, actorOf(req));
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.reopen(id, req.user.businessId, actorOf(req));
  }

  @Post(':id/charges')
  addCharge(@Param('id') id: string, @Body() dto: { itemId?: string; quantity?: number }, @Req() req: Authed) {
    return this.svc.addCharge(id, req.user.businessId, dto ?? {}, actorOf(req));
  }

  @Patch(':id/charges/:chargeId/remove')
  removeCharge(@Param('id') id: string, @Param('chargeId') chargeId: string, @Req() req: Authed) {
    return this.svc.removeCharge(id, chargeId, req.user.businessId);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @Body() dto: { payments?: Array<{ method: string; amountCents: number; reference?: string }>; buyerKraPin?: string }, @Req() req: Authed) {
    return this.svc.complete(id, req.user.businessId, actorOf(req), dto ?? {});
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body('reason') reason: string, @Req() req: Authed) {
    return this.svc.cancel(id, req.user.businessId, reason);
  }
}
