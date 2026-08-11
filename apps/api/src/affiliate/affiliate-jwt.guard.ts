import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

/** Validates an affiliate JWT (role AFFILIATE) and attaches req.affiliateId. */
@Injectable()
export class AffiliateJwtGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { affiliateId?: string }>();
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Affiliate token required');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = this.jwt.verify(auth.slice(7)) as any;
      if (payload.role !== 'AFFILIATE') throw new UnauthorizedException();
      req.affiliateId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired affiliate token');
    }
  }
}
