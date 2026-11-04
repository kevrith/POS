import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { requireString } from '../common/validate';
import type { PrintActor } from './print-jobs.service';

/** A station that asked within this long ago counts as online. The bridge polls every few seconds. */
export const STATION_ONLINE_MS = 30_000;
/** lastSeenAt is only rewritten this often, so polling does not turn into a write per request. */
const TOUCH_EVERY_MS = 15_000;
const TOKEN_PREFIX = 'pst_';
const MANAGER_ROLES = ['OWNER', 'MANAGER'];

export interface AuthenticatedStation {
  id: string;
  businessId: string;
  storeId: string;
}

export function hashStationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const SUMMARY_SELECT = { id: true, storeId: true, name: true, lastSeenAt: true, revokedAt: true, createdAt: true } as const;

@Injectable()
export class PrintStationsService {
  constructor(private prisma: PrismaService) {}

  private requireManager(actor: PrintActor) {
    if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Only an owner or manager can manage print stations');
  }

  /** The token is returned ONCE. Only its hash is kept, so a database leak does not leak working credentials. */
  async create(dto: { storeId: string; name: string }, actor: PrintActor) {
    this.requireManager(actor);
    requireString(dto?.storeId, 'storeId');
    const name = requireString(dto.name, 'name').trim().slice(0, 60);
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId: actor.businessId }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');

    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const station = await this.prisma.printStation.create({
      data: { businessId: actor.businessId, storeId: dto.storeId, name, tokenHash: hashStationToken(token), createdById: actor.id },
      select: SUMMARY_SELECT,
    });
    return { station, token };
  }

  async list(storeId: string, actor: PrintActor) {
    this.requireManager(actor);
    requireString(storeId, 'storeId');
    const rows = await this.prisma.printStation.findMany({
      where: { businessId: actor.businessId, storeId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SUMMARY_SELECT,
    });
    const now = Date.now();
    return rows.map((r) => ({ ...r, online: !!r.lastSeenAt && now - r.lastSeenAt.getTime() < STATION_ONLINE_MS }));
  }

  async revoke(id: string, actor: PrintActor) {
    this.requireManager(actor);
    const found = await this.prisma.printStation.findFirst({ where: { id, businessId: actor.businessId, revokedAt: null }, select: { id: true } });
    if (!found) throw new NotFoundException('Print station not found');
    await this.prisma.printStation.update({ where: { id }, data: { revokedAt: new Date() } });
    return { message: 'Print station revoked' };
  }

  /** Resolve a station token. Returns null for an unknown or revoked token, and records that the station is alive. */
  async authenticate(token: string | undefined): Promise<AuthenticatedStation | null> {
    if (!token || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
    const station = await this.prisma.printStation.findUnique({
      where: { tokenHash: hashStationToken(token) },
      select: { id: true, businessId: true, storeId: true, revokedAt: true, lastSeenAt: true },
    });
    if (!station || station.revokedAt) return null;
    const now = Date.now();
    if (!station.lastSeenAt || now - station.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      await this.prisma.printStation.update({ where: { id: station.id }, data: { lastSeenAt: new Date(now) } }).catch(() => undefined);
    }
    return { id: station.id, businessId: station.businessId, storeId: station.storeId };
  }
}
