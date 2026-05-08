import { Controller, Post, Body, UseGuards, Req, Get, Redirect, Delete, Param, UnauthorizedException } from '@nestjs/common';
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
  userId?: string; // optional: scope PIN check to a specific user
}

interface RegisterDto {
  name: string;
  email: string;
  password: string;
  businessName: string;
}

@SkipSubscriptionCheck()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password, dto.totpCode);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login/pin')
  async loginPin(@Body() dto: PinLoginDto) {
    return this.authService.loginWithPin(dto.pin, dto.businessId, dto.storeId, dto.userId);
  }

  @Public()
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

  /**
   * Frontend-initiated Google OAuth (used by @react-oauth/google).
   * Receives the Google access token from the browser, verifies it with Google,
   * and returns a KASTRA JWT.
   */
  @Public()
  @SkipThrottle()
  @Post('google/token')
  async googleToken(@Body() body: { accessToken: string }) {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${body.accessToken}`,
    );
    if (!res.ok) throw new UnauthorizedException('Invalid Google access token');
    const profile = await res.json() as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    return this.authService.loginWithGoogle({
      googleId: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? 'Google User',
      avatarUrl: profile.picture ?? null,
    });
  }

  @Public()
  @SkipThrottle()
  @Post('google/register')
  async googleRegister(@Body() body: { accessToken: string; businessName: string }) {
    if (!body.businessName?.trim()) throw new UnauthorizedException('Business name is required');
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${body.accessToken}`,
    );
    if (!res.ok) throw new UnauthorizedException('Invalid Google access token');
    const profile = await res.json() as {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    return this.authService.registerWithGoogle({
      googleId: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? 'Google User',
      avatarUrl: profile.picture ?? null,
      businessName: body.businessName.trim(),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('manager-pin/verify')
  async verifyManagerPin(
    @Body() dto: { pin: string; businessId: string },
  ) {
    return this.authService.verifyManagerPin(dto.pin, dto.businessId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(@Req() req: Request & { user: AuthUser }, @Body() body: { currentPassword: string; newPassword: string }) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async getSessions(@Req() req: Request & { user: AuthUser }) {
    return this.authService.getSessions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(@Req() req: Request & { user: AuthUser }, @Param('id') id: string) {
    return this.authService.revokeSession(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions')
  async revokeAllSessions(@Req() req: Request & { user: AuthUser }) {
    return this.authService.revokeAllSessions(req.user.id);
  }

  // ─── Forgot / Reset password (public — no JWT needed) ─────────────────────

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPasswordWithToken(body.token, body.newPassword);
  }
}
