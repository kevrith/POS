import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/** Validates JWT tokens signed with SUPER_ADMIN_SECRET (separate from main app JWT). */
@Injectable()
export class SuperAdminAuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Super admin token required');

    const token = auth.slice(7);
    try {
      const payload = this.jwt.verify(token, { secret: process.env.SUPER_ADMIN_SECRET ?? 'super-admin-change-me' });
      (req as any).superAdmin = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired super admin token');
    }
  }
}
