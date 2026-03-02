import { AsyncLocalStorage } from 'async_hooks';

/**
 * Stores the current request's businessId across async boundaries.
 * Used by Prisma middleware to enforce tenant isolation as a safety net.
 */
export const tenantContext = new AsyncLocalStorage<{ businessId: string }>();
