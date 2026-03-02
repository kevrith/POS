import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { tenantContext } from './tenant-context';

interface JwtPayload {
  sub: string;
  businessId: string;
}

/**
 * Extracts businessId from the JWT bearer token (decode only — signature
 * verification is handled by JwtAuthGuard) and runs the rest of the
 * request pipeline inside an AsyncLocalStorage context.
 * This allows PrismaService.$use middleware to log unscoped queries.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      try {
        // Decode JWT payload without verifying (read-only, non-security-critical)
        const parts = auth.slice(7).split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64url').toString('utf8'),
          ) as JwtPayload;
          if (payload?.businessId) {
            tenantContext.run({ businessId: payload.businessId }, next);
            return;
          }
        }
      } catch {
        // Non-fatal — proceed without context
      }
    }
    next();
  }
}
