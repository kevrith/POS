import { Feature } from '@pos/shared';
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequiresFeature } from '../auth/subscription.guard';
import { LabService } from './lab.service';

type Authed = Request & { user: AuthUser };
const actorOf = (req: Authed) => ({ id: req.user.id, name: req.user.name, role: String(req.user.role) });

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PRESCRIPTIONS)
@Controller('lab')
export class LabController {
  constructor(private svc: LabService) {}

  // The catalogue
  @Get('tests')
  tests(@Query('all') all: string | undefined, @Req() req: Authed) {
    return this.svc.tests(req.user.businessId, all === '1');
  }

  @Post('tests/starter')
  starter(@Req() req: Authed) {
    return this.svc.loadStarter(req.user.businessId);
  }

  @Post('tests')
  createTest(@Body() dto: Record<string, unknown>, @Req() req: Authed) {
    return this.svc.createTest(req.user.businessId, dto ?? {});
  }

  @Patch('tests/:id')
  updateTest(@Param('id') id: string, @Body() dto: Record<string, unknown>, @Req() req: Authed) {
    return this.svc.updateTest(req.user.businessId, id, dto ?? {});
  }

  // Orders. Fixed paths before ':id'.
  @Get('board')
  board(@Query('storeId') storeId: string | undefined, @Req() req: Authed) {
    return this.svc.board(req.user.businessId, storeId);
  }

  @Get('orders')
  forVisit(@Query('visitId') visitId: string, @Req() req: Authed) {
    return this.svc.forVisit(req.user.businessId, visitId);
  }

  @Get('history/:patientId')
  history(@Param('patientId') patientId: string, @Req() req: Authed) {
    return this.svc.history(req.user.businessId, patientId);
  }

  @Post('orders')
  create(@Body() dto: { visitId?: string; tests?: unknown; priority?: string; clinicalNotes?: string }, @Req() req: Authed) {
    return this.svc.createOrder(req.user.businessId, dto ?? {}, actorOf(req));
  }

  @Get('orders/:id')
  order(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.order(req.user.businessId, id);
  }

  @Post('orders/:id/collect')
  collect(@Param('id') id: string, @Req() req: Authed) {
    return this.svc.collect(req.user.businessId, id, actorOf(req));
  }

  @Post('orders/:id/cancel')
  cancel(@Param('id') id: string, @Body() dto: { reason?: string }, @Req() req: Authed) {
    return this.svc.cancel(req.user.businessId, id, dto?.reason);
  }

  @Patch('orders/:id/items/:itemId/results')
  results(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: { values?: unknown; comment?: string }, @Req() req: Authed) {
    return this.svc.saveResults(req.user.businessId, id, itemId, dto ?? {}, actorOf(req));
  }

  @Post('orders/:id/items/:itemId/verify')
  verify(@Param('id') id: string, @Param('itemId') itemId: string, @Req() req: Authed) {
    return this.svc.verify(req.user.businessId, id, itemId, actorOf(req));
  }

  @Post('orders/:id/items/:itemId/acknowledge')
  acknowledge(@Param('id') id: string, @Param('itemId') itemId: string, @Req() req: Authed) {
    return this.svc.acknowledgeCritical(req.user.businessId, id, itemId, actorOf(req));
  }

  @Post('orders/:id/items/:itemId/reopen')
  reopen(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: { reason?: string }, @Req() req: Authed) {
    return this.svc.reopen(req.user.businessId, id, itemId, dto?.reason, actorOf(req));
  }
}
