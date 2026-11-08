import { Body, Controller, Get, Post } from '@nestjs/common';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { LicenseService } from './license.service';

/**
 * The offline edition's licence, as the app sees it: the status screen and banners read it, the owner activates a key here.
 * On the cloud server `status` says "cloud" and the others are refused.
 */
@SkipSubscriptionCheck()
@Controller('license')
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  @Get('status')
  status() {
    return this.license.status();
  }

  /** Owner only (see access-policy). */
  @Post('activate')
  activate(@Body() body: { key: string }) {
    return this.license.activate(body?.key);
  }

  /** "Check now". */
  @Post('renew')
  renew() {
    return this.license.renew();
  }
}
