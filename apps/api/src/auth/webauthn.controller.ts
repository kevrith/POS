import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  Headers,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';
import { WebAuthnService } from './webauthn.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Public } from './jwt-auth.guard';
import { SkipSubscriptionCheck } from './subscription.guard';
import { pageOrigin, resolveRelyingParty } from './webauthn-origin';

@Controller('auth/webauthn')
export class WebAuthnController {
  constructor(private readonly webauthn: WebAuthnService) {}

  // ─── Registration (requires existing JWT session) ──────────────────────────

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Get('register/begin')
  async registrationBegin(
    @Query('userId') userId: string,
    @Query('businessId') _businessId: string,
    @Req() req: Request & { user: AuthUser },
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
  ) {
    await this.webauthn.assertCanManageUser(req.user, userId);
    return this.webauthn.registrationBegin(userId, req.user.businessId, resolveRelyingParty(pageOrigin(origin, referer)));
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
    @Req() req: Request & { user: AuthUser },
  ) {
    await this.webauthn.assertCanManageUser(req.user, body.userId);
    return this.webauthn.registrationComplete({ ...body, businessId: req.user.businessId });
  }

  // ─── Authentication (public — no JWT required) ─────────────────────────────

  @Public()
  @SkipSubscriptionCheck()
  @Get('login/begin')
  async authenticationBegin(
    @Query('businessId') businessId: string,
    @Query('userId') userId?: string,
    @Headers('origin') origin?: string,
    @Headers('referer') referer?: string,
  ) {
    return this.webauthn.authenticationBegin(businessId, resolveRelyingParty(pageOrigin(origin, referer)), userId);
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
  async listCredentials(@Query('userId') userId: string, @Req() req: Request & { user: AuthUser }) {
    await this.webauthn.assertCanManageUser(req.user, userId);
    return this.webauthn.listCredentials(userId);
  }

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Delete('credentials/:id')
  async deleteCredential(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    await this.webauthn.assertCanManageUser(req.user, userId);
    return this.webauthn.deleteCredential(id, userId);
  }
}
