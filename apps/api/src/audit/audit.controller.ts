import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHash } from 'node:crypto';

@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('entity') entity?: string,
    @Query('actor') actor?: string,
    @Query('limit') limit = '200',
    @Query('offset') offset = '0',
  ) {
    const entries = await this.prisma.auditLog.findMany({
      where: {
        businessId,
        ...(startDate && { createdAt: { gte: new Date(startDate) } }),
        ...(endDate && { createdAt: { ...(startDate ? { gte: new Date(startDate) } : {}), lte: new Date(endDate) } }),
        ...(entity && { entity }),
        ...(actor && { actor }),
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });
    return entries;
  }

  @Get('verify')
  async verify(@Query('businessId') businessId: string) {
    // Verify hash chain integrity for the last 1000 entries
    const entries = await this.prisma.auditLog.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });

    let valid = true;
    let brokenAt: string | null = null;
    let prevHash = '0'.repeat(64);

    for (const entry of entries) {
      const content = JSON.stringify({
        businessId: entry.businessId,
        actor: entry.actor,
        actorType: entry.actorType,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        source: entry.source,
        previousHash: prevHash,
      });
      const expected = createHash('sha256').update(content).digest('hex');
      if (expected !== entry.hash) {
        valid = false;
        brokenAt = entry.id;
        break;
      }
      prevHash = entry.hash;
    }

    return { valid, brokenAt, checkedEntries: entries.length };
  }
}
