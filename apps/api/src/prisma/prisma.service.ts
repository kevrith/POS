import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context';

/**
 * Multi-tenant models — all have a `businessId` field.
 * Queries on these models without a businessId filter trigger a warning.
 */
// Tenant model safety net disabled — tenant isolation is enforced at the HTTP
// layer by JwtAuthGuard + TenantGuard. The middleware check caused false-positive
// 500s on legitimate queries that filter by itemId/storeId/poId rather than businessId.
const TENANT_MODELS = new Set<string>();

/** Operations that read multiple records and should always be tenant-scoped. */
const SCOPED_OPS = new Set(['findMany', 'count', 'aggregate', 'groupBy']);

/**
 * Models where a record belongs to exactly one business and may never be read by
 * another. Deliberately a short, hand-picked list rather than every tenant model:
 * a blanket net was tried before and reverted because it threw on legitimate
 * queries that filter by itemId/storeId/poId. This one does not throw — it adds
 * the missing filter — and covers only records whose leakage actually matters.
 */
const SINGLE_TENANT_MODELS = new Set([
  'Sale', 'Customer', 'Expense', 'Supplier', 'Item',
  'DeliveryOrder', 'Prescription', 'PurchaseOrder', 'Shift',
]);

/**
 * Single-record reads, mapped to the operation that accepts a non-unique filter.
 * `findUnique` only allows unique fields in `where`, so adding businessId means
 * switching to `findFirst` — same result shape, same include/select handling.
 */
const SINGLE_READ_OPS = new Map<string, string>([
  ['findUnique', 'findFirst'],
  ['findUniqueOrThrow', 'findFirstOrThrow'],
  ['findFirst', 'findFirst'],
  ['findFirstOrThrow', 'findFirstOrThrow'],
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    // Belt-and-suspenders tenant isolation.
    // Logs a warning (does NOT throw) when a bulk-read on a tenant-aware model
    // is executed without a businessId filter while a request context is active.
    // Primary enforcement is done by TenantGuard at the HTTP layer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.$use as any)(async (params: any, next: (p: any) => Promise<unknown>) => {
      const ctx = tenantContext.getStore();
      const model: string = params.model ?? '';

      /**
       * Fetching a record by its id alone returns it whoever owns it — 92 such
       * lookups exist, and the HTTP guard cannot help because the id IS the whole
       * query. Rather than thread businessId through all of them, add it here when
       * a request context is active. No context (seeds, jobs, super-admin, public
       * portal routes) means no injection, so those paths are untouched.
       */
      if (ctx && SINGLE_TENANT_MODELS.has(model) && SINGLE_READ_OPS.has(params.action as string)) {
        const args = (params.args ?? {}) as { where?: Record<string, unknown> };
        const where = args.where ?? {};
        if (where['businessId'] === undefined) {
          params.action = SINGLE_READ_OPS.get(params.action as string);
          params.args = { ...args, where: { ...where, businessId: ctx.businessId } };
        }
      }

      if (ctx && TENANT_MODELS.has(model) && SCOPED_OPS.has(params.action as string)) {
        const where = (params.args as { where?: Record<string, unknown> })?.where;
        if (!where?.businessId && !where?.id) {
          const msg =
            `[TenantMiddleware] ${model}.${params.action as string} ` +
            `executed WITHOUT businessId filter (ctx=${ctx.businessId})`;
          if (process.env.NODE_ENV === 'production') {
            throw new Error(msg);
          } else {
            this.logger.warn(msg);
          }
        }
      }

      return next(params);
    });
  }
}
