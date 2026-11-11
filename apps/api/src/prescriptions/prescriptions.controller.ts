import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { CLINICAL_APPROVER_ROLES, CLINICAL_SELF_APPROVE } from './clinical-roles';
import { PrescriptionsService, type FillOptions, type SafetyOverride } from './prescriptions.service';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });
/** Only the fields a fill uses; anything else in the body (the old screens sent `dispensedBy`) is ignored. */
const fillOptions = (b?: FillOptions): FillOptions => ({ payments: b?.payments, insurance: b?.insurance, buyerKraPin: b?.buyerKraPin });
type FillBody = FillOptions & { override?: { reason?: string; managerPin?: string } };

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private svc: PrescriptionsService, private auth: AuthService) {}

  /**
   * Setting a blocking safety warning aside needs a manager: their PIN, or their own login. What the body claims about who
   * approved is never used; the approver is always a verified person.
   */
  private async resolveOverride(body: FillBody | undefined, req: Authed): Promise<SafetyOverride | undefined> {
    const o = body?.override;
    if (!o) return undefined;
    const reason = String(o.reason ?? '');
    if (o.managerPin) {
      const m = await this.auth.verifyManagerPin(o.managerPin, req.user.businessId, CLINICAL_APPROVER_ROLES);
      return { reason, approvedById: m.userId, approvedByName: m.name };
    }
    if (CLINICAL_SELF_APPROVE.includes(String(req.user.role))) return { reason, approvedById: req.user.id, approvedByName: req.user.name };
    throw new ForbiddenException('A manager or pharmacist must approve this. Enter their PIN.');
  }

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

  /** The safety checks on a prescription still being written. */
  @Post('safety-check')
  safetyCheck(@Body() body: { patientId?: string; items?: unknown }, @Req() req: Authed) {
    return this.svc.previewSafety(req.user.businessId, body ?? {});
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
    // A doctor signed in is the prescriber: the name comes from the login, not from what the form says.
    const prescriber = String(req.user.role) === 'DOCTOR' ? { doctorName: req.user.name } : {};
    return this.svc.create({ ...dto, ...prescriber, businessId: req.user.businessId });
  }

  /** The safety checks on a saved prescription, as of now. */
  @Get(':id/safety')
  safety(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.safety(id, req.user.businessId);
  }

  /** What the next fill costs, for the pharmacist to collect against. */
  @Get(':id/quote')
  quote(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.quote(id, req.user.businessId);
  }

  @Patch(':id/dispense')
  async dispense(@Param('id') id: string, @Body() body: FillBody | undefined, @Req() req: Authed) {
    return this.svc.dispense(id, req.user.businessId, actorOf(req), { ...fillOptions(body), override: await this.resolveOverride(body, req) });
  }

  @Patch(':id/refill')
  async refill(@Param('id') id: string, @Body() body: FillBody | undefined, @Req() req: Authed) {
    return this.svc.refill(id, req.user.businessId, actorOf(req), { ...fillOptions(body), override: await this.resolveOverride(body, req) });
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
