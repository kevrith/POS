import { Injectable } from '@nestjs/common';
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

  /** Tamper-evident hash-chained audit log. All financial actions must call this. */
  async createEntry(entry: NewAuditEntry): Promise<void> {
    const lastEntry = await this.prisma.auditLog.findFirst({
      where: { businessId: entry.businessId },
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });

    const previousHash = lastEntry?.hash ?? '0'.repeat(64);
    const content = JSON.stringify({ ...entry, previousHash });
    const hash = createHash('sha256').update(content).digest('hex');

    await this.prisma.auditLog.create({
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
