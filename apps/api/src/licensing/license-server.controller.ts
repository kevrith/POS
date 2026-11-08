import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { LicenseAuthorityService, LicenseRequest } from './license-authority.service';

/**
 * Called by the OFFLINE edition (not by people): it has no account here, only a licence key and its Machine ID, so the routes
 * are public and rate-limited. What they hand out is a signed token that is worthless to anyone but the computer it names.
 */
@SkipSubscriptionCheck()
@Controller('license-server')
export class LicenseServerController {
  constructor(private readonly authority: LicenseAuthorityService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('activate')
  activate(@Body() body: LicenseRequest) {
    return this.authority.activate(body);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('renew')
  renew(@Body() body: LicenseRequest) {
    return this.authority.renew(body);
  }
}
