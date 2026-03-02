import { Controller, Post, Body, UseGuards, Req, Get, Redirect } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard, Public } from './jwt-auth.guard';
import { SkipSubscriptionCheck } from './subscription.guard';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';

interface LoginDto {
  email: string;
  password: string;
  totpCode?: string;
}

interface PinLoginDto {
  pin: string;
  businessId: string;
  storeId?: string;
}

interface RegisterDto {
  name: string;
  email: string;
  password: string;
  businessName: string;
}

@Public()
@SkipSubscriptionCheck()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password, dto.totpCode);
  }

  @Throttle({ auth: { limit: 20, ttl: 60000 } })
  @Post('login/pin')
  async loginPin(@Body() dto: PinLoginDto) {
    return this.authService.loginWithPin(dto.pin, dto.businessId, dto.storeId);
  }

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.registerOwner(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: Request & { user: AuthUser }) {
    return this.authService.refreshToken(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('totp/setup')
  async setupTotp(@Req() req: Request & { user: AuthUser }) {
    return this.authService.setupTotp(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: Request & { user: AuthUser }) {
    return req.user;
  }

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  /** Browser navigates here to start Google OAuth consent flow. */
  @SkipThrottle()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // passport initiates redirect — no body needed
  }

  /** Google redirects back here after user grants permission. */
  @SkipThrottle()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @Redirect()
  async googleCallback(@Req() req: Request & { user: { accessToken: string; user: AuthUser } }) {
    const { accessToken, user } = req.user;
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    // Redirect to frontend with token in query string; frontend stores it in sessionStorage
    return {
      url: `${frontendUrl}/?oauth_token=${accessToken}&oauth_businessId=${user.businessId}&oauth_role=${user.role}&oauth_name=${encodeURIComponent(user.name)}&oauth_id=${user.id}`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('manager-pin/verify')
  async verifyManagerPin(
    @Body() dto: { pin: string; businessId: string },
  ) {
    return this.authService.verifyManagerPin(dto.pin, dto.businessId);
  }
}
