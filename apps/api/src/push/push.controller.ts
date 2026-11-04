import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { PortalAuthGuard } from '../customer-portal/portal-auth.guard';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private push: PushService) {}

  /** App calls this after obtaining its Expo push token (on login / app start). */
  @Post('register')
  register(@Body() dto: { userId: string; token: string }) {
    return this.push.registerToken(dto.userId, dto.token);
  }

  /** App calls this on logout so a shared device stops receiving pushes. */
  @Post('unregister')
  unregister(@Body() dto: { userId: string }) {
    return this.push.unregisterToken(dto.userId);
  }

  /**
   * Customer app. It signs in with a phone-OTP portal session (not a staff JWT), so the
   * token belongs to the customer that session proves, not to whichever phone number the
   * caller types. The old route required a staff JWT, so every call from the app came
   * back 401, and the app signs a customer out on any 401.
   */
  @Public()
  @UseGuards(PortalAuthGuard)
  @Post('register-customer')
  registerCustomer(@Req() req: { portalCustomerId: string }, @Body() dto: { token: string }) {
    return this.push.registerCustomerTokenById(req.portalCustomerId, dto.token);
  }
}
