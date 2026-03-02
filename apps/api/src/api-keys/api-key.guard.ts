import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'crypto';
import type { Request } from 'express';

/**
 * Guard that validates incoming requests authenticated via an API key
 * provided in the `x-api-key` request header.
 *
 * After verifying the key hash it also enforces the optional IP whitelist
 * stored on the ApiKey record as a JSON array.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = req.headers['x-api-key'] as string | undefined;
    if (!rawKey) throw new UnauthorizedException('API key required');

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!apiKey || !apiKey.isActive) throw new UnauthorizedException('Invalid or revoked API key');

    // IP whitelist check
    if (apiKey.ipWhitelist) {
      try {
        const whitelist: string[] = JSON.parse(apiKey.ipWhitelist);
        if (whitelist.length > 0) {
          const clientIp = (
            req.ip ||
            (req.connection as any)?.remoteAddress ||
            ''
          ).replace('::ffff:', '');

          const isAllowed = whitelist.some((allowed) => {
            if (!allowed) return false;
            if (allowed.includes('/')) {
              // Basic CIDR: check byte prefix match
              const [network, bits] = allowed.split('/');
              const prefixBytes = Math.floor(parseInt(bits, 10) / 8);
              const netParts = network.split('.').map(Number);
              const clientParts = clientIp.split('.').map(Number);
              return netParts
                .slice(0, prefixBytes)
                .every((b, i) => b === clientParts[i]);
            }
            return clientIp === allowed;
          });

          if (!isAllowed) throw new ForbiddenException('IP not in whitelist');
        }
      } catch (e) {
        if (e instanceof ForbiddenException) throw e;
        // Malformed whitelist JSON — allow through
      }
    }

    // Stamp last-used timestamp (fire-and-forget, don't block the request)
    this.prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    // Attach the key metadata to the request for downstream use
    (req as any).apiKey = {
      id: apiKey.id,
      businessId: apiKey.businessId,
      scopes: (() => {
        try {
          return JSON.parse(apiKey.scopes);
        } catch {
          return [];
        }
      })(),
    };

    return true;
  }
}
