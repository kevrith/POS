import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DesktopInstallsService, compareVersions } from './desktop-installs.service';

const NOW = new Date('2026-11-11T10:00:00Z');
const ID = 'machine-1234567890';

function build(latest: string | null = '1.1.6', rows: any[] = []) {
  const store = new Map<string, any>(rows.map((r) => [r.machineId, r]));
  const prisma: any = {
    desktopInstall: {
      findUnique: jest.fn(async ({ where }: any) => (where.machineId ? store.get(where.machineId) : [...store.values()].find((r) => r.id === where.id)) ?? null),
      findMany: jest.fn(async () => [...store.values()]),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const cur = store.get(where.machineId);
        const next = cur ? { ...cur, ...update } : { id: `id-${store.size + 1}`, updateRequestedAt: null, updateRequestedFor: null, ...create };
        store.set(where.machineId, next);
        return next;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const cur = [...store.values()].find((r) => r.id === where.id);
        const next = { ...cur, ...data };
        store.set(cur.machineId, next);
        return next;
      }),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    business: { findMany: jest.fn(async () => [{ id: 'b1', name: 'Real Name Ltd' }]) },
  };
  const service = new DesktopInstallsService(prisma);
  service.http = (async () => {
    if (latest === null) throw new Error('offline');
    return new Response(JSON.stringify({ version: latest }), { status: 200 });
  }) as unknown as typeof fetch;
  return { prisma, service, store };
}
const row = (extra: Record<string, unknown> = {}) => ({
  id: 'r1', machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.2', businessId: null, businessName: 'Premier',
  firstSeenAt: NOW, lastSeenAt: new Date(NOW.getTime() - 3_600_000), updateRequestedAt: null, updateRequestedFor: null, ...extra,
});

describe('compareVersions', () => {
  it('orders versions as numbers, not text', () => {
    expect(compareVersions('1.1.10', '1.1.9')).toBe(1);
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.1.6', '1.1.6')).toBe(0);
  });
});

describe('an app reporting in', () => {
  it('is recorded the first time, with what it says about itself', async () => {
    const { prisma, service } = build();
    const out = await service.report({ machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.5', businessName: 'Premier' }, NOW);
    expect(prisma.desktopInstall.upsert.mock.calls[0][0].create).toEqual(expect.objectContaining({ machineId: ID, appVersion: '1.1.5', hostname: 'SHOP-PC', businessName: 'Premier' }));
    expect(out).toEqual({ updateRequested: false, latestVersion: '1.1.6' });
  });

  it('refuses a report with no usable computer id or a version that is not x.y.z, and bounds long text', async () => {
    const { prisma, service } = build();
    await expect(service.report({ appVersion: '1.1.5' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.report({ machineId: 'short', appVersion: '1.1.5' }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    for (const appVersion of ['', 'latest', '1.1', '1.1.5-evil', "1.1.5'; DROP TABLE x", 5]) {
      await expect(service.report({ machineId: ID, appVersion }, NOW)).rejects.toBeInstanceOf(BadRequestException);
    }
    await service.report({ machineId: ID, appVersion: '1.1.5', hostname: 'x'.repeat(500) }, NOW);
    expect(prisma.desktopInstall.upsert.mock.calls[0][0].create.hostname).toHaveLength(120);
  });

  it('does not write again when nothing changed a few minutes ago, but does when the version moves', async () => {
    const { prisma, service } = build('1.1.6', [row({ appVersion: '1.1.5', lastSeenAt: new Date(NOW.getTime() - 60_000), hostname: 'SHOP-PC', os: 'windows', businessName: 'Premier' })]);
    await service.report({ machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.5', businessName: 'Premier' }, NOW);
    expect(prisma.desktopInstall.upsert).not.toHaveBeenCalled();
    await service.report({ machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.6', businessName: 'Premier' }, NOW);
    expect(prisma.desktopInstall.upsert).toHaveBeenCalledTimes(1);
  });

  it('tells a flagged computer to update, and clears the flag by itself once it has the newest version', async () => {
    const { service, store } = build('1.1.6', [row({ appVersion: '1.1.2', updateRequestedAt: NOW, updateRequestedFor: '1.1.6' })]);
    expect(await service.report({ machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.2', businessName: 'Premier' }, NOW)).toEqual({ updateRequested: true, latestVersion: '1.1.6' });
    expect(await service.report({ machineId: ID, hostname: 'SHOP-PC', os: 'windows', appVersion: '1.1.6', businessName: 'Premier' }, NOW)).toEqual({ updateRequested: false, latestVersion: '1.1.6' });
    expect(store.get(ID).updateRequestedAt).toBeNull();
  });

  it('still records the report when the newest version cannot be read (GitHub down), and never invents a flag', async () => {
    const { service } = build(null);
    expect(await service.report({ machineId: ID, appVersion: '1.1.5' }, NOW)).toEqual({ updateRequested: false, latestVersion: null });
  });
});

describe('the admin list and requests', () => {
  it('shows who is behind, uses the real business name when the business exists, and counts requests', async () => {
    const { service } = build('1.1.6', [
      row({ id: 'a', machineId: 'machine-aaaaaaaa', appVersion: '1.1.2', businessId: 'b1', updateRequestedAt: NOW }),
      row({ id: 'b', machineId: 'machine-bbbbbbbb', appVersion: '1.1.6' }),
    ]);
    const out = await service.list();
    expect(out).toMatchObject({ latestVersion: '1.1.6', total: 2, behind: 1, requested: 1 });
    expect(out.installs.find((i) => i.id === 'a')).toMatchObject({ status: 'BEHIND', businessName: 'Real Name Ltd' });
    expect(out.installs.find((i) => i.id === 'b')).toMatchObject({ status: 'UP_TO_DATE', businessName: 'Premier' });
  });

  it('says UNKNOWN rather than guessing when the newest version cannot be read', async () => {
    const { service } = build(null, [row()]);
    expect((await service.list()).installs[0].status).toBe('UNKNOWN');
  });

  it('flags a computer that is behind, refuses one that is up to date, and can cancel', async () => {
    const { service, store } = build('1.1.6', [row({ id: 'a', appVersion: '1.1.2' }), row({ id: 'b', machineId: 'machine-bbbbbbbb', appVersion: '1.1.6' })]);
    await service.requestUpdate('a');
    expect(store.get(ID).updateRequestedAt).toBeInstanceOf(Date);
    expect(store.get(ID).updateRequestedFor).toBe('1.1.6');
    await expect(service.requestUpdate('b')).rejects.toThrow(/newest version/);
    await expect(service.requestUpdate('nope')).rejects.toBeInstanceOf(NotFoundException);
    await service.cancelRequest('a');
    expect(store.get(ID).updateRequestedAt).toBeNull();
  });
});
