/**
 * Which version of the desktop app each installed computer runs, and asking one to update.
 *
 * Installed apps already ask GitHub for the newest version by themselves, but nothing told us which computers were behind.
 * Now each app reports in (version, computer name, system, last seen) every few hours while it has internet. The platform
 * admin sees the list, and can flag a computer: its app is told on its next report and shows an "update requested" banner
 * the owner or a manager acts on. A flag clears by itself once the computer reports the newest version.
 *
 * What an app reports is taken at its word and used only for display and targeting; nothing here gives access to anything.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Where installed apps look for the newest version; the same file (see tauri.conf.json plugins.updater.endpoints). */
const DEFAULT_MANIFEST = 'https://github.com/kevrith/POS/releases/download/desktop-updates/latest.json';
const LATEST_CACHE_MS = 30 * 60_000;
/** A computer that reports the same thing again within this time does not write to the database again. */
const MIN_WRITE_GAP_MS = 10 * 60_000;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

export interface HeartbeatInput {
  machineId?: unknown;
  hostname?: unknown;
  os?: unknown;
  appVersion?: unknown;
  businessId?: unknown;
  businessName?: unknown;
}

export interface HeartbeatAnswer {
  /** The admin asked this computer to update (and it has not yet). */
  updateRequested: boolean;
  latestVersion: string | null;
}

/** 1 if a is newer than b, -1 if older, 0 if the same. Both must be x.y.z. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

@Injectable()
export class DesktopInstallsService {
  private readonly logger = new Logger(DesktopInstallsService.name);
  /** Replaceable in tests. */
  http: typeof fetch = (input, init) => fetch(input, init);
  private latest: { version: string | null; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** The newest published version, or null when it cannot be read (the manifest is on GitHub; this must never fail a report). */
  async latestVersion(now: number = Date.now()): Promise<string | null> {
    if (this.latest && now - this.latest.at < LATEST_CACHE_MS) return this.latest.version;
    let version: string | null = null;
    try {
      const res = await this.http(process.env.DESKTOP_UPDATE_MANIFEST_URL || DEFAULT_MANIFEST, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const body = (await res.json()) as { version?: unknown };
        if (typeof body.version === 'string' && VERSION.test(body.version)) version = body.version;
      }
    } catch (e) {
      this.logger.warn(`Could not read the update manifest: ${String(e)}`);
    }
    // A failed read is remembered for a short while only, so a GitHub hiccup does not hide the newest version for half an hour.
    this.latest = { version, at: version ? now : now - LATEST_CACHE_MS + 60_000 };
    return version;
  }

  /** An app reporting in. Public, so every input is checked and bounded. */
  async report(input: HeartbeatInput, now: Date = new Date()): Promise<HeartbeatAnswer> {
    const machineId = text(input?.machineId, 200);
    if (!machineId || machineId.length < 8) throw new BadRequestException('This computer could not be identified.');
    const appVersion = typeof input?.appVersion === 'string' ? input.appVersion.trim() : '';
    if (!VERSION.test(appVersion)) throw new BadRequestException('appVersion must look like 1.2.3');
    const data = {
      hostname: text(input.hostname, 120),
      os: text(input.os, 60),
      businessId: text(input.businessId, 64),
      businessName: text(input.businessName, 120),
    };

    const latest = await this.latestVersion(now.getTime());
    const existing = await this.prisma.desktopInstall.findUnique({ where: { machineId } });

    const fulfilled = !!existing?.updateRequestedAt && !!latest && compareVersions(appVersion, latest) >= 0;
    const unchanged = !!existing && existing.appVersion === appVersion && !fulfilled &&
      now.getTime() - existing.lastSeenAt.getTime() < MIN_WRITE_GAP_MS &&
      existing.hostname === data.hostname && existing.os === data.os && existing.businessId === data.businessId && existing.businessName === data.businessName;

    if (!unchanged) {
      await this.prisma.desktopInstall.upsert({
        where: { machineId },
        create: { machineId, appVersion, ...data, firstSeenAt: now, lastSeenAt: now },
        update: { appVersion, ...data, lastSeenAt: now, ...(fulfilled ? { updateRequestedAt: null, updateRequestedFor: null } : {}) },
      });
    }
    return { updateRequested: !!existing?.updateRequestedAt && !fulfilled, latestVersion: latest };
  }

  // ── The platform admin's side ──────────────────────────────────────────────

  async list() {
    const [rows, latest] = await Promise.all([
      this.prisma.desktopInstall.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 1000 }),
      this.latestVersion(),
    ]);
    const ids = [...new Set(rows.map((r) => r.businessId).filter((id): id is string => !!id))];
    const businesses = ids.length === 0 ? [] : await this.prisma.business.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
    const installs = rows.map((r) => ({
      ...r,
      // A business that exists here gives the real name; an offline shop only has the name its app reported.
      businessName: (r.businessId && nameOf.get(r.businessId)) || r.businessName,
      status: !latest ? 'UNKNOWN' : compareVersions(r.appVersion, latest) >= 0 ? 'UP_TO_DATE' : 'BEHIND',
    }));
    return {
      latestVersion: latest,
      total: installs.length,
      behind: installs.filter((i) => i.status === 'BEHIND').length,
      requested: installs.filter((i) => i.updateRequestedAt).length,
      installs,
    };
  }

  async requestUpdate(id: string) {
    const row = await this.prisma.desktopInstall.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That computer was not found.');
    const latest = await this.latestVersion();
    if (latest && compareVersions(row.appVersion, latest) >= 0) throw new BadRequestException('That computer already has the newest version.');
    return this.prisma.desktopInstall.update({ where: { id }, data: { updateRequestedAt: new Date(), updateRequestedFor: latest } });
  }

  async cancelRequest(id: string) {
    const row = await this.prisma.desktopInstall.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That computer was not found.');
    return this.prisma.desktopInstall.update({ where: { id }, data: { updateRequestedAt: null, updateRequestedFor: null } });
  }

  /** Forget a computer (a retired one). It comes back by itself if it ever reports in again. */
  async remove(id: string) {
    await this.prisma.desktopInstall.deleteMany({ where: { id } });
    return { removed: true };
  }
}
