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

    const businessId = (req.params['businessId'] as string | undefined)
      ?? (req.query['businessId'] as string | undefined)
      ?? (req.body as Record<string, unknown> | undefined)?.['businessId'] as string | undefined;

    if (businessId && businessId !== user.businessId) {
      throw new ForbiddenException('Access denied to this business');
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
