import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.service';
import { PrintJobsService, type CompleteDto } from './print-jobs.service';
import { PrintStationGuard, type StationRequest } from './print-station.guard';
import { PrintStationsService } from './print-stations.service';

type AuthedRequest = Request & { user: AuthUser };
const actorOf = (req: AuthedRequest) => ({ id: req.user.id, businessId: req.user.businessId, role: String(req.user.role) });

/** Owner/manager manage stations with their normal login. */
@Controller('print-stations')
export class PrintStationsController {
  constructor(private stations: PrintStationsService) {}

  @Post()
  create(@Body() body: { storeId: string; name: string }, @Req() req: AuthedRequest) {
    return this.stations.create(body, actorOf(req));
  }

  @Get()
  list(@Query('storeId') storeId: string, @Req() req: AuthedRequest) {
    return this.stations.list(storeId, actorOf(req));
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.stations.revoke(id, actorOf(req));
  }
}

/**
 * The station itself: no person is signed in, only the token. A station can only ever touch jobs of the
 * store it was created for. It polls every few seconds, so it is exempt from the per-IP write throttle
 * (a shop's tills share one address); the token is 256 bits, so guessing is not a concern.
 */
@Public()
@SkipThrottle()
@UseGuards(PrintStationGuard)
@Controller('print-bridge')
export class PrintBridgeController {
  constructor(private jobs: PrintJobsService) {}

  private actor(req: StationRequest) {
    return { id: `station:${req.station.id}`, businessId: req.station.businessId, role: 'STATION' };
  }

  @Post('claim')
  claim(@Body() body: { limit?: number }, @Req() req: StationRequest) {
    return this.jobs.claim(req.station.storeId, req.station.id, body?.limit, this.actor(req));
  }

  @Post(':id/result')
  result(@Param('id') id: string, @Body() body: CompleteDto, @Req() req: StationRequest) {
    return this.jobs.complete(id, body, req.station.id, this.actor(req));
  }
}
