import { Body, Controller, Post } from '@nestjs/common';
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
   * Self-service customer app: it has no login, only a phone number entered at
   * checkout/loyalty, so the token is keyed to the Customer matched by phone.
   */
  @Post('register-customer')
  registerCustomer(@Body() dto: { businessId: string; phone: string; token: string }) {
    return this.push.registerCustomerToken(dto.businessId, dto.phone, dto.token);
  }
}
