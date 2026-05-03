import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from './tenant-context';

/**
 * Multi-tenant models — all have a `businessId` field.
 * Queries on these models without a businessId filter trigger a warning.
 */
const TENANT_MODELS = new Set([
  'Item', 'Sale', 'Customer', 'Store', 'User', 'InventoryMovement',
  'GRN', 'Supplier', 'Expense', 'Employee', 'Promotion', 'GiftCard',
  'LoyaltyProgram', 'AuditLog', 'Notification', 'Budget', 'Shift',
  'Order', 'Table', 'Reservation', 'SerialRecord', 'ItemBatch',
  'Bundle', 'Recipe', 'PrinterConfig', 'ApiKey', 'ReportSchedule',
  'Webhook', 'Transfer', 'UserStore',
]);

/** Operations that read multiple records and should always be tenant-scoped. */
const SCOPED_OPS = new Set(['findMany', 'count', 'aggregate', 'groupBy']);

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
