import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrintStationGuard } from './print-station.guard';
import { PrintStationsService, hashStationToken } from './print-stations.service';

const owner = { id: 'u1', businessId: 'biz-A', role: 'OWNER' };
const cashier = { id: 'u2', businessId: 'biz-A', role: 'CASHIER' };

function make() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    printStation: {
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'st1', storeId: data.storeId, name: data.name, lastSeenAt: null, revokedAt: null, createdAt: new Date() })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new PrintStationsService(prisma) };
}

describe('print stations', () => {
  it('returns the token once and stores only its hash', async () => {
    const { prisma, service } = make();
    const { token, station } = await service.create({ storeId: 's1', name: 'Front till' }, owner);
    expect(token).toMatch(/^pst_[A-Za-z0-9_-]{40,}$/);
    const stored = prisma.printStation.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(hashStationToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(station)).not.toContain('tokenHash');
  });

  it('only an owner or manager can create, list or revoke; and only in their own business', async () => {
    const { prisma, service } = make();
    await expect(service.create({ storeId: 's1', name: 'x' }, cashier)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list('s1', cashier)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.revoke('st1', cashier)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(service.create({ storeId: 'store-of-B', name: 'x' }, owner)).rejects.toBeInstanceOf(NotFoundException);
    prisma.printStation.findFirst.mockResolvedValue(null);
    await expect(service.revoke('station-of-B', owner)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.printStation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-A' }) }));
  });

  it('marks a station online only if it was seen in the last 30 seconds', async () => {
    const { prisma, service } = make();
    prisma.printStation.findMany.mockResolvedValue([
      { id: 'a', lastSeenAt: new Date(Date.now() - 5_000) },
      { id: 'b', lastSeenAt: new Date(Date.now() - 120_000) },
      { id: 'c', lastSeenAt: null },
    ]);
    const rows = await service.list('s1', owner);
    expect(rows.map((r: any) => r.online)).toEqual([true, false, false]);
  });

  it('authenticates a good token and tells the store and business it belongs to', async () => {
    const { prisma, service } = make();
    prisma.printStation.findUnique.mockResolvedValue({ id: 'st1', businessId: 'biz-A', storeId: 's1', revokedAt: null, lastSeenAt: new Date() });
    const station = await service.authenticate('pst_abc');
    expect(station).toEqual({ id: 'st1', businessId: 'biz-A', storeId: 's1' });
    expect(prisma.printStation.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: hashStationToken('pst_abc') } }));
    expect(prisma.printStation.update).not.toHaveBeenCalled(); // seen a moment ago: no write per poll
  });

  it('refreshes lastSeenAt when the station was quiet for a while', async () => {
    const { prisma, service } = make();
    prisma.printStation.findUnique.mockResolvedValue({ id: 'st1', businessId: 'biz-A', storeId: 's1', revokedAt: null, lastSeenAt: new Date(Date.now() - 60_000) });
    await service.authenticate('pst_abc');
    expect(prisma.printStation.update).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown, revoked, malformed and missing tokens', async () => {
    const { prisma, service } = make();
    prisma.printStation.findUnique.mockResolvedValue(null);
    expect(await service.authenticate('pst_unknown')).toBeNull();
    prisma.printStation.findUnique.mockResolvedValue({ id: 'st1', businessId: 'b', storeId: 's', revokedAt: new Date(), lastSeenAt: null });
    expect(await service.authenticate('pst_revoked')).toBeNull();
    expect(await service.authenticate(undefined)).toBeNull();
    expect(await service.authenticate('not-a-station-token')).toBeNull();
    expect(await service.authenticate('pst_' + 'x'.repeat(300))).toBeNull();
  });

  it('the guard turns a bad token into 401 and attaches the station otherwise', async () => {
    const stations: any = { authenticate: jest.fn() };
    const guard = new PrintStationGuard(stations);
    const ctx = (headers: any) => {
      const req: any = { headers };
      return { req, context: { switchToHttp: () => ({ getRequest: () => req }) } as any };
    };
    stations.authenticate.mockResolvedValue(null);
    await expect(guard.canActivate(ctx({}).context)).rejects.toBeInstanceOf(UnauthorizedException);
    stations.authenticate.mockResolvedValue({ id: 'st1', businessId: 'b', storeId: 's' });
    const { req, context } = ctx({ 'x-print-station-token': 'pst_abc' });
    expect(await guard.canActivate(context)).toBe(true);
    expect(stations.authenticate).toHaveBeenLastCalledWith('pst_abc');
    expect(req.station.storeId).toBe('s');
  });
});
