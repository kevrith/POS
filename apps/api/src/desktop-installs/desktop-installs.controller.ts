import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { DesktopInstallsService, type HeartbeatInput } from './desktop-installs.service';

/**
 * Called by the installed desktop app itself (not by a signed-in person): it reports its version and learns whether the
 * platform admin has asked it to update. Public and rate-limited; see the service for why that is safe.
 */
@SkipSubscriptionCheck()
@Controller('desktop')
export class DesktopInstallsController {
  constructor(private readonly installs: DesktopInstallsService) {}

  @Public()
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  @Post('heartbeat')
  heartbeat(@Body() body: HeartbeatInput) {
    return this.installs.report(body);
  }
}
