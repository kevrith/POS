import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { Request } from 'express';

/** Validates JWT tokens signed with SUPER_ADMIN_SECRET and enforces IP whitelist. */
@Injectable()
export class SuperAdminAuthGuard implements CanActivate {
  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    // ── 1. Verify JWT ───────────────────────────────────────────────────────
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedException('Super admin token required');

    const token = auth.slice(7);
    let payload: any;
    try {
      payload = this.jwt.verify(token, { secret: process.env.SUPER_ADMIN_SECRET ?? 'super-admin-change-me' });
      (req as any).superAdmin = payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired super admin token');
    }

    // ── 2. IP whitelist check ───────────────────────────────────────────────
    // If the whitelist table is empty → all IPs allowed (open mode).
    // Once any entry is added → only listed IPs may access.
    try {
      const whitelistCount = await (this.prisma as any).superAdminIpWhitelist.count();
      if (whitelistCount > 0) {
        const clientIp = this.extractIp(req);
        const allowed = await (this.prisma as any).superAdminIpWhitelist.findFirst({
          where: { ip: clientIp },
        });
        if (!allowed) {
          throw new ForbiddenException(`Access denied: IP ${clientIp} is not whitelisted`);
        }
      }
    } catch (err) {
      // Re-throw Forbidden; swallow any DB errors so a DB hiccup doesn't lock out all admins
      if ((err as any)?.status === 403) throw err;
    }

    return true;
  }

  private extractIp(req: Request): string {
    // Respect X-Forwarded-For from trusted proxies (Nginx, load balancers)
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return first.trim();
    }
    return req.socket?.remoteAddress ?? req.ip ?? '';
  }
}
