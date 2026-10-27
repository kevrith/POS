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

  /**
   * Key on `req.ip`, not the library default.
   *
   * The default is `req.ips[0]` — the *leftmost* X-Forwarded-For entry, which is
   * whatever the caller sent and so trivially spoofed. `req.ip` is Express's own
   * computation under `trust proxy` (set in main.ts), which counts hops from the
   * socket inward and therefore lands on the address our proxy actually observed.
   *
   * Getting this right is what makes a per-caller limit per-caller: with no proxy
   * trust configured at all, every request behind a load balancer reports the
   * balancer's address and a 5/min endpoint becomes 5/min for the whole platform.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
