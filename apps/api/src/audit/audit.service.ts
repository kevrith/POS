import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

interface NewAuditEntry {
  businessId: string;
  actor: string;
  actorType: 'USER' | 'SYSTEM' | 'INTEGRATION' | 'SUPERADMIN';
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  source?: 'POS' | 'INTEGRATION' | 'SUPERADMIN' | 'SYSTEM';
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Tamper-evident hash-chained audit log. All financial actions must call this.
   *
   * Called from inside a transaction, pass that transaction's client as `db`. Without it the log is read and written on a
   * SECOND connection while the transaction holds the first: on a pool of one (connection_limit=1, the pgbouncer setup) that
   * waits for a connection that never frees up, times out after 10 seconds and fails the whole operation with a 500.
   * Passing `db` also makes the entry commit or roll back together with the change it records.
   */
  async createEntry(entry: NewAuditEntry, db: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma): Promise<void> {
    const lastEntry = await db.auditLog.findFirst({
      where: { businessId: entry.businessId },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });

    const previousHash = lastEntry?.hash ?? '0'.repeat(64);
    const content = JSON.stringify({ ...entry, previousHash });
    const hash = createHash('sha256').update(content).digest('hex');

    await db.auditLog.create({
      data: {
        businessId: entry.businessId,
        actor: entry.actor,
        actorType: entry.actorType,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before ? JSON.stringify(entry.before) : null,
        after: entry.after ? JSON.stringify(entry.after) : null,
        source: entry.source ?? 'POS',
        previousHash,
        hash,
      },
    });
  }
}
