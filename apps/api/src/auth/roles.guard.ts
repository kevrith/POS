import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_PERMISSIONS, UserRole } from '@pos/shared';
import type { Request } from 'express';
import type { AuthUser } from './auth.service';

export const PERMISSION_KEY = 'required_permission';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!requiredPermission) return true;

    const req = context.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = req.user;
    if (!user) return false;

    const permissions = ROLE_PERMISSIONS[user.role as UserRole];
    if (!permissions) throw new ForbiddenException('Role not recognized');

    if (permissions.includes('*')) return true;

    const hasPermission = permissions.some(
      (p) =>
        p === requiredPermission ||
        (p.endsWith('.*') && requiredPermission.startsWith(p.slice(0, -2))),
    );

    if (!hasPermission) {
      throw new ForbiddenException(`Requires permission: ${requiredPermission}`);
    }

    return true;
  }
}
