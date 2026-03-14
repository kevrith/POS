import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom throttler that skips rate-limiting for GET (read-only) requests.
 * POST/PATCH/PUT/DELETE are still throttled to protect mutating endpoints.
 *
 * A POS app polls many GET endpoints frequently (reports every 10s, items, etc.)
 * so throttling reads would cause spurious 429s during normal operation.
 *
 * Only one global throttler ('default', 300 req/min) is registered.
 * Sensitive endpoints (login, M-Pesa) override it via @Throttle({ default: { limit: N, ttl: 60000 } }).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ method: string }>();
    // Skip throttle entirely for safe read requests
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return true;
    }
    return false;
  }
}
