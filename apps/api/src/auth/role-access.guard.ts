import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import type { AuthUser } from './auth.service';
import { evaluateAccess, matchesPattern, normalizePath } from './access-policy';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Global role check — see access-policy.ts for the rules it applies.
 *
 * Runs after JwtAuthGuard (so req.user exists) and TenantGuard. @Public routes
 * are skipped: they carry no staff token, and other guards (portal, affiliate,
 * super-admin, print station) authenticate them.
 */
@Injectable()
export class RoleAccessGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return true; // not a staff-token route; its own guard decides

    const decision = evaluateAccess(user.role, req.method, req.originalUrl ?? req.url);
    if (!decision.allowed) throw new ForbiddenException(decision.reason);

    this.pinFieldIdentity(req, user);
    return true;
  }

  /**
   * Field apps send their own id as a plain parameter (`agentId`, `driverId`),
   * which means any agent could read another agent's call plan or credit book by
   * changing it. For the two field roles the token is the identity: a different
   * id is refused and a missing one is filled in from the token.
   */
  private pinFieldIdentity(req: Request, user: AuthUser): void {
    const path = normalizePath(req.originalUrl ?? req.url);

    if (user.role === 'SALES_AGENT' && matchesPattern('/field-sales/**', path)) {
      const fromQuery = req.query?.['agentId'];
      const fromBody = isPlainObject(req.body) ? req.body['agentId'] : undefined;
      for (const supplied of [fromQuery, fromBody]) {
        if (supplied && supplied !== user.id) {
          throw new ForbiddenException('Agents can only act on their own account');
        }
      }
      if (req.query) req.query['agentId'] = user.id;
      if (isPlainObject(req.body)) req.body['agentId'] = user.id;
    }

    if (user.role === 'DRIVER') {
      const m = /^\/delivery\/(driver-earnings)\/([^/]+)$/.exec(path);
      if (m && m[2] !== user.id) {
        throw new ForbiddenException('Drivers can only view their own earnings');
      }
    }
  }
}
