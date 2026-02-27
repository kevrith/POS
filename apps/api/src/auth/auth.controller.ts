import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
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
    try {
      console.log('PIN login attempt:', { pin: dto.pin?.substring(0, 2) + '**', businessId: dto.businessId });
      const result = await this.authService.loginWithPin(dto.pin, dto.businessId, dto.storeId);
      console.log('PIN login success:', result.user.name);
      return result;
    } catch (error) {
      console.error('PIN login error:', error.message, error.stack);
      throw error;
    }
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
}
