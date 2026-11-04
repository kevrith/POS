import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrintStationsService, type AuthenticatedStation } from './print-stations.service';

export const STATION_TOKEN_HEADER = 'x-print-station-token';
export type StationRequest = Request & { station: AuthenticatedStation };

/** Authenticates a print station by its long-lived token. Used on the bridge routes, which are @Public to the JWT guard. */
@Injectable()
export class PrintStationGuard implements CanActivate {
  constructor(private stations: PrintStationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StationRequest>();
    const raw = req.headers[STATION_TOKEN_HEADER];
    const station = await this.stations.authenticate(Array.isArray(raw) ? raw[0] : raw);
    if (!station) throw new UnauthorizedException('Invalid print station token');
    req.station = station;
    return true;
  }
}
