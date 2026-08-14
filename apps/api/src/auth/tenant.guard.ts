import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';

/** Bodies can be arrays (bulk endpoints) or absent — only fill in plain objects. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private prisma: PrismaService, private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip for public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = req.user;
    if (!user) return false;

    const fromParams = req.params?.['businessId'] as string | undefined;
    const fromQuery = req.query?.['businessId'] as string | undefined;
    const fromBody = isPlainObject(req.body)
      ? (req.body['businessId'] as string | undefined)
      : undefined;

    const provided = fromParams ?? fromQuery ?? fromBody;
    if (provided && provided !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
    }

    /**
     * Backfill the tenant from the token when the client omitted it.
     *
     * Rejecting a mismatch is only half the job. Most services take businessId
     * straight off the query or body and put it in a Prisma `where` — and Prisma
     * drops keys whose value is `undefined`, so an omitted businessId does not
     * narrow the query to one tenant, it removes the tenant filter entirely and
     * returns every business's rows. Leaving it out was therefore more dangerous
     * than sending someone else's id, which at least got caught above.
     *
     * Filling it in here means no downstream service can be handed `undefined`,
     * whatever the client sends. Services that don't read businessId are
     * unaffected; there is no global ValidationPipe to reject the extra field.
     */
    if (!fromQuery && req.query) {
      req.query['businessId'] = user.businessId;
    }
    if (!fromBody && isPlainObject(req.body)) {
      req.body['businessId'] = user.businessId;
    }

    const storeId = (req.params['storeId'] as string | undefined)
      ?? (req.query['storeId'] as string | undefined);

    if (storeId) {
      const store = await this.prisma.store.findUnique({ where: { id: storeId } });
      if (!store || store.businessId !== user.businessId) {
        throw new ForbiddenException('Store not in business');
      }
    }

    return true;
  }
}
