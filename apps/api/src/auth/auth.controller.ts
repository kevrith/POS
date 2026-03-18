import { Controller, Post, Body, UseGuards, Req, Get, Redirect, Delete, Param } from '@nestjs/common';
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

@Public()
@SkipSubscriptionCheck()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.loginWithPassword(dto.email, dto.password, dto.totpCode);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('login/pin')
  async loginPin(@Body() dto: PinLoginDto) {
    return this.authService.loginWithPin(dto.pin, dto.businessId, dto.storeId, dto.userId);
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

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPasswordWithToken(body.token, body.newPassword);
  }
}
