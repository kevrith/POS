import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrintersService } from '../printers/printers.service';
import { isPrivateIPv4 } from '../printers/network-target';
import { requireString } from '../common/validate';
import {
  CLIENT_METHODS, MAX_PAYLOAD_BYTES, STALE_SENDING_MS, afterFailure, backoffMs, isPrintJobKind, parseIpHostPort, ttlMs,
  type PrintJobKind,
} from './print-job.rules';

export interface PrintActor {
  id: string;
  businessId: string;
  role: string;
}

export interface EnqueueDto {
  storeId: string;
  printerId: string;
  kind: string;
  /** ESC/POS bytes, base64. */
  data: string;
  saleId?: string;
  refNumber?: string;
  copyNumber?: number;
  reason?: string;
}

export interface LogDto {
  storeId: string;
  kind: string;
  method: string;
  ok: boolean;
  error?: string;
  saleId?: string;
  refNumber?: string;
  copyNumber?: number;
  reason?: string;
}

export interface CompleteDto {
  ok: boolean;
  error?: string;
  /** The job can never succeed (bad address): stop retrying. */
  permanent?: boolean;
}

const MANAGER_ROLES = ['OWNER', 'MANAGER'];
const CLAIM_LIMIT_MAX = 10;
const LIST_LIMIT_MAX = 200;

/** The queue row without its bytes: payloads are only ever sent to the bridge that prints them. */
const SUMMARY_SELECT = {
  id: true, storeId: true, printerId: true, kind: true, status: true, method: true, payloadBytes: true, saleId: true,
  refNumber: true, copyNumber: true, reason: true, attempts: true, lastError: true, createdById: true, claimedBy: true,
  sentAt: true, nextAttemptAt: true, expiresAt: true, createdAt: true,
} as const;

@Injectable()
export class PrintJobsService {
  private readonly logger = new Logger(PrintJobsService.name);
  /** `direct`: this server can reach the LAN, try the printer at once. `queue`: only a print bridge delivers. */
  private readonly mode: 'direct' | 'queue';

  constructor(
    private prisma: PrismaService,
    private printers: PrintersService,
  ) {
    this.mode = process.env.PRINT_DELIVERY_MODE === 'queue' ? 'queue' : 'direct';
  }

  private requireManager(actor: PrintActor) {
    if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Only an owner or manager can do this');
  }

  private async assertStore(storeId: string, businessId: string) {
    requireString(storeId, 'storeId');
    const store = await this.prisma.store.findFirst({ where: { id: storeId, businessId }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');
  }

  private async findOwnedJob(id: string, businessId: string) {
    const job = await this.prisma.printJob.findFirst({ where: { id, businessId } });
    if (!job) throw new NotFoundException('Print job not found');
    return job;
  }

  private cleanCopy(copyNumber: unknown): number {
    const n = Number(copyNumber ?? 0);
    return Number.isInteger(n) && n >= 0 && n < 1000 ? n : 0;
  }

  /** Jobs nobody delivered in time are marked EXPIRED so they cannot print hours later. */
  private async expireOverdue(businessId: string, storeId?: string) {
    await this.prisma.printJob.updateMany({
      where: { businessId, ...(storeId && { storeId }), status: { in: ['QUEUED', 'SENDING'] }, expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED', lastError: 'Not delivered in time' },
    });
  }

  // ─── Queue a job for a LAN printer ──────────────────────────────────────────

  async enqueue(dto: EnqueueDto, actor: PrintActor) {
    await this.assertStore(dto?.storeId, actor.businessId);
    requireString(dto.printerId, 'printerId');
    requireString(dto.data, 'data');
    if (!isPrintJobKind(dto.kind)) throw new BadRequestException('Unknown print job kind');

    const printer = await this.prisma.printer.findFirst({ where: { id: dto.printerId, storeId: dto.storeId, store: { businessId: actor.businessId } } });
    if (!printer) throw new NotFoundException('Printer not found');
    if (printer.connectionType !== 'NETWORK') throw new BadRequestException('Only network printers can be queued');

    const bytes = Buffer.from(dto.data, 'base64');
    if (bytes.length === 0) throw new BadRequestException('data must be base64-encoded print bytes');
    if (bytes.length > MAX_PAYLOAD_BYTES) throw new BadRequestException('Print job is too large');

    const kind: PrintJobKind = dto.kind;
    const now = new Date();
    const job = await this.prisma.printJob.create({
      data: {
        businessId: actor.businessId,
        storeId: dto.storeId,
        printerId: printer.id,
        kind,
        status: 'QUEUED',
        method: 'BRIDGE',
        payload: dto.data,
        payloadBytes: bytes.length,
        saleId: dto.saleId,
        refNumber: dto.refNumber,
        copyNumber: this.cleanCopy(dto.copyNumber),
        reason: dto.reason,
        createdById: actor.id,
        nextAttemptAt: now,
        expiresAt: new Date(now.getTime() + ttlMs(kind)),
      },
      select: { id: true },
    });

    if (this.mode === 'direct') {
      try {
        await this.printers.printToNetwork(printer.id, dto.data, actor.businessId);
        const sent = await this.prisma.printJob.update({
          where: { id: job.id },
          data: { status: 'SENT', method: 'DIRECT', attempts: 1, sentAt: new Date(), payload: null },
          select: SUMMARY_SELECT,
        });
        return { job: sent, delivered: true };
      } catch (err) {
        // This server cannot reach the printer (cloud deployment, printer off). Leave it for a bridge, with a delay.
        const message = err instanceof Error ? err.message : 'Printer unreachable';
        this.logger.warn(`Direct print to ${printer.id} failed, queued for a bridge: ${message}`);
        const queued = await this.prisma.printJob.update({
          where: { id: job.id },
          data: { attempts: 1, lastError: message, nextAttemptAt: new Date(now.getTime() + backoffMs(1)) },
          select: SUMMARY_SELECT,
        });
        return { job: queued, delivered: false };
      }
    }

    const queued = await this.prisma.printJob.findUniqueOrThrow({ where: { id: job.id }, select: SUMMARY_SELECT });
    return { job: queued, delivered: false };
  }

  // ─── Record a print the person's own device made ───────────────────────────

  async log(dto: LogDto, actor: PrintActor) {
    await this.assertStore(dto?.storeId, actor.businessId);
    if (!isPrintJobKind(dto.kind)) throw new BadRequestException('Unknown print job kind');
    if (!(CLIENT_METHODS as readonly string[]).includes(dto.method)) throw new BadRequestException('Unknown print method');
    const now = new Date();
    return this.prisma.printJob.create({
      data: {
        businessId: actor.businessId,
        storeId: dto.storeId,
        kind: dto.kind,
        status: dto.ok ? 'SENT' : 'FAILED',
        method: dto.method,
        saleId: dto.saleId,
        refNumber: dto.refNumber,
        copyNumber: this.cleanCopy(dto.copyNumber),
        reason: dto.reason,
        attempts: 1,
        lastError: dto.ok ? null : (dto.error ?? 'Print failed').slice(0, 300),
        createdById: actor.id,
        sentAt: dto.ok ? now : null,
        expiresAt: now,
      },
      select: SUMMARY_SELECT,
    });
  }

  /**
   * How many times this sale's receipt has already been printed. 0 means the next print is the original;
   * anything higher is a copy, and the till prints it with a COPY banner and no cash drawer pulse.
   */
  async nextReceiptCopy(saleId: string, actor: PrintActor): Promise<{ copyNumber: number }> {
    requireString(saleId, 'saleId');
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, businessId: actor.businessId }, select: { id: true } });
    if (!sale) throw new NotFoundException('Sale not found');
    const printed = await this.prisma.printJob.count({
      where: { businessId: actor.businessId, saleId, kind: 'RECEIPT', status: { in: ['SENT', 'QUEUED', 'SENDING'] } },
    });
    return { copyNumber: printed };
  }

  // ─── Visibility and recovery (owner / manager) ─────────────────────────────

  async list(storeId: string, status: string | undefined, limit: number | undefined, actor: PrintActor) {
    this.requireManager(actor);
    await this.assertStore(storeId, actor.businessId);
    await this.expireOverdue(actor.businessId, storeId);
    return this.prisma.printJob.findMany({
      where: { businessId: actor.businessId, storeId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(limit) || 50, 1), LIST_LIMIT_MAX),
      select: SUMMARY_SELECT,
    });
  }

  /**
   * What the owner needs to spot misuse: how often receipts were reprinted and who by, who opened the cash
   * drawer by hand (no sale), and how many prints are failing. Counts only; never any print content.
   */
  async summary(storeId: string, days: number | undefined, actor: PrintActor) {
    this.requireManager(actor);
    await this.assertStore(storeId, actor.businessId);
    const span = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 90);
    const since = new Date(Date.now() - span * 86_400_000);
    const base = { businessId: actor.businessId, storeId, createdAt: { gte: since } };

    const [byKindStatus, reprints, manualDrawer] = await Promise.all([
      this.prisma.printJob.groupBy({ by: ['kind', 'status'], where: base, _count: { _all: true } }),
      this.prisma.printJob.groupBy({ by: ['createdById'], where: { ...base, kind: 'RECEIPT', copyNumber: { gt: 0 }, status: { in: ['SENT', 'QUEUED', 'SENDING'] } }, _count: { _all: true } }),
      this.prisma.printJob.groupBy({ by: ['createdById'], where: { ...base, kind: 'DRAWER', reason: 'MANUAL', status: { in: ['SENT', 'QUEUED', 'SENDING'] } }, _count: { _all: true } }),
    ]);

    const ids = Array.from(new Set([...reprints, ...manualDrawer].map((r) => r.createdById).filter((v): v is string => !!v)));
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids }, businessId: actor.businessId }, select: { id: true, name: true } }) : [];
    const nameOf = (id: string | null) => (id ? users.find((u) => u.id === id)?.name ?? 'Unknown' : 'Unknown');
    const byPerson = (rows: typeof reprints) =>
      rows.map((r) => ({ userId: r.createdById, name: nameOf(r.createdById), count: r._count._all })).sort((a, b) => b.count - a.count);
    const count = (status: string) => byKindStatus.filter((r) => r.status === status).reduce((s, r) => s + r._count._all, 0);

    return {
      days: span,
      since,
      total: byKindStatus.reduce((s, r) => s + r._count._all, 0),
      sent: count('SENT'),
      failed: count('FAILED') + count('EXPIRED'),
      waiting: count('QUEUED') + count('SENDING'),
      byKind: byKindStatus.map((r) => ({ kind: r.kind, status: r.status, count: r._count._all })),
      reprintsByPerson: byPerson(reprints),
      manualDrawerOpensByPerson: byPerson(manualDrawer),
    };
  }

  async retry(id: string, actor: PrintActor) {
    this.requireManager(actor);
    const job = await this.findOwnedJob(id, actor.businessId);
    if (!['FAILED', 'EXPIRED', 'CANCELLED'].includes(job.status)) throw new BadRequestException('Only a failed, expired or cancelled job can be retried');
    if (!job.payload) throw new BadRequestException('This print was made on the device and has no bytes to resend');
    const now = new Date();
    return this.prisma.printJob.update({
      where: { id },
      data: {
        status: 'QUEUED', method: 'BRIDGE', attempts: 0, lastError: null, claimedBy: null, claimedAt: null,
        nextAttemptAt: now, expiresAt: new Date(now.getTime() + ttlMs(job.kind as PrintJobKind)),
      },
      select: SUMMARY_SELECT,
    });
  }

  async cancel(id: string, actor: PrintActor) {
    this.requireManager(actor);
    const job = await this.findOwnedJob(id, actor.businessId);
    if (job.status !== 'QUEUED') throw new BadRequestException('Only a waiting job can be cancelled');
    return this.prisma.printJob.update({ where: { id }, data: { status: 'CANCELLED' }, select: SUMMARY_SELECT });
  }

  // ─── Print bridge: a till on the shop LAN that delivers queued jobs ─────────

  async claim(storeId: string, bridgeId: string, limit: number | undefined, actor: PrintActor) {
    await this.assertStore(storeId, actor.businessId);
    requireString(bridgeId, 'bridgeId');
    await this.expireOverdue(actor.businessId, storeId);

    const now = new Date();
    const candidates = await this.prisma.printJob.findMany({
      where: {
        businessId: actor.businessId,
        storeId,
        method: 'BRIDGE',
        payload: { not: null },
        nextAttemptAt: { lte: now },
        expiresAt: { gt: now },
        OR: [{ status: 'QUEUED' }, { status: 'SENDING', claimedAt: { lt: new Date(now.getTime() - STALE_SENDING_MS) } }],
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(Number(limit) || 5, 1), CLAIM_LIMIT_MAX),
    });

    const claimed: Array<{ id: string; kind: string; data: string; host: string; port: number; attempts: number }> = [];
    for (const job of candidates) {
      // The conditional update is the lock: only one bridge can move a job out of its current state.
      const won = await this.prisma.printJob.updateMany({
        where: { id: job.id, status: job.status, claimedAt: job.claimedAt },
        data: { status: 'SENDING', claimedBy: bridgeId, claimedAt: now, attempts: { increment: 1 } },
      });
      if (won.count !== 1) continue;

      const printer = job.printerId
        ? await this.prisma.printer.findFirst({ where: { id: job.printerId, store: { businessId: actor.businessId } } })
        : null;
      const target = printer ? parseIpHostPort(printer.connectionDetails) : null;
      if (!printer || !target || !isPrivateIPv4(target.host)) {
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            lastError: !printer ? 'The printer was removed' : 'A bridge needs the printer\'s private IP address (192.168.x.x, 10.x.x.x)',
          },
        });
        continue;
      }
      claimed.push({ id: job.id, kind: job.kind, data: job.payload as string, host: target.host, port: target.port, attempts: job.attempts + 1 });
    }
    return claimed;
  }

  async complete(id: string, dto: CompleteDto, bridgeId: string, actor: PrintActor) {
    const job = await this.findOwnedJob(id, actor.businessId);
    if (job.status !== 'SENDING' || job.claimedBy !== bridgeId) {
      // Expired or re-claimed by another bridge meanwhile. Not an error for the caller to fix.
      return { status: job.status };
    }
    if (dto?.ok) {
      const done = await this.prisma.printJob.update({
        where: { id },
        data: { status: 'SENT', sentAt: new Date(), lastError: null, payload: null },
        select: { status: true },
      });
      return done;
    }
    const outcome = afterFailure({ attempts: job.attempts, permanent: dto?.permanent, now: new Date() });
    const failed = await this.prisma.printJob.update({
      where: { id },
      data: {
        status: outcome.status,
        lastError: (dto?.error ?? 'Print failed').slice(0, 300),
        claimedBy: null,
        claimedAt: null,
        ...(outcome.status === 'QUEUED' && { nextAttemptAt: outcome.nextAttemptAt }),
      },
      select: { status: true },
    });
    return failed;
  }
}
