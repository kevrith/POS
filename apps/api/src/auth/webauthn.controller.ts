import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './jwt-auth.guard';
import { SkipSubscriptionCheck } from './subscription.guard';

@Controller('auth/webauthn')
export class WebAuthnController {
  constructor(private readonly webauthn: WebAuthnService) {}

  // ─── Registration (requires existing JWT session) ──────────────────────────

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Get('register/begin')
  async registrationBegin(
    @Query('userId') userId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.webauthn.registrationBegin(userId, businessId);
  }

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Post('register/complete')
  async registrationComplete(
    @Body()
    body: {
      userId: string;
      businessId: string;
      credentialId: string;
      clientDataJSON: string;
      publicKeyDer: string;
      transports?: string[];
      deviceName?: string;
    },
  ) {
    return this.webauthn.registrationComplete(body);
  }

  // ─── Authentication (public — no JWT required) ─────────────────────────────

  @Public()
  @SkipSubscriptionCheck()
  @Get('login/begin')
  async authenticationBegin(
    @Query('businessId') businessId: string,
    @Query('userId') userId?: string,
  ) {
    return this.webauthn.authenticationBegin(businessId, userId);
  }

  @Public()
  @SkipSubscriptionCheck()
  @Post('login/complete')
  async authenticationComplete(
    @Body()
    body: {
      businessId: string;
      challengeKey: string;
      credentialId: string;
      clientDataJSON: string;
      authenticatorData: string;
      signature: string;
      userHandle?: string;
    },
  ) {
    return this.webauthn.authenticationComplete(body);
  }

  // ─── Credential management ─────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Get('credentials')
  async listCredentials(@Query('userId') userId: string) {
    return this.webauthn.listCredentials(userId);
  }

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Delete('credentials/:id')
  async deleteCredential(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ) {
    return this.webauthn.deleteCredential(id, userId);
  }
}
