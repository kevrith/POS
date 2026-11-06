import { Injectable, OnModuleInit, Logger, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
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
 * Every model that carries a businessId, read straight from the generated schema
 * rather than hand-listed — a new tenant model is then protected the day it is
 * added, instead of the day someone remembers this file.
 *
 * Safe to apply broadly because this adds a filter rather than throwing (the
 * earlier blanket net threw, which is why it was reverted), and because it only
 * acts on single-record reads and writes while a request context is active.
 * Callers that legitimately span businesses are unaffected: franchise rollups use
 * aggregate/count, and affiliate and super-admin tokens carry no businessId, so
 * no context exists for them at all.
 */
const SINGLE_TENANT_MODELS = new Set<string>(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'businessId'))
    .map((m) => m.name),
);

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

/**
 * Single-record writes. These cannot be filtered the way reads can — Prisma's
 * `update`/`delete` take a unique `where`, and rewriting them to updateMany
 * would change what the caller gets back from a record to a count. So ownership
 * is checked first instead, and a record belonging to someone else is reported
 * as missing rather than forbidden: confirming it exists is itself a leak.
 */
const SINGLE_WRITE_OPS = new Set(['update', 'delete']);

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

      /**
       * Same hole on the write side: `update({ where: { id } })` edits the record
       * whoever owns it. Verify ownership first — the check itself carries a
       * businessId, so it skips the injection above and cannot recurse.
       */
      if (ctx && SINGLE_TENANT_MODELS.has(model) && SINGLE_WRITE_OPS.has(params.action as string)) {
        const args = (params.args ?? {}) as { where?: Record<string, unknown> };
        const where = args.where ?? {};
        if (where['businessId'] === undefined && where['id'] !== undefined) {
          // Run the check through `next`, not through `this.<model>.findFirst`. `next` stays on the caller's own
          // connection, so inside an interactive transaction (a sale, for one) the check is part of that
          // transaction. Going through `this` opened a SECOND connection while the transaction held the first;
          // with a pool of one (`connection_limit=1`, as the pgbouncer setup uses) that waited for a connection
          // that could never free up, timed out after 10s and failed the sale with a blank 500.
          const owned = await next({
            ...params,
            action: 'findFirst',
            args: { where: { id: where['id'], businessId: ctx.businessId }, select: { id: true } },
          });
          if (!owned) {
            throw new NotFoundException(`${model} not found`);
          }
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
