import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PrintJobsService } from './print-jobs.service';
import { PrintStationGuard } from './print-station.guard';
import { PrintBridgeController, PrintStationsController } from './print-stations.controller';
import { PrintStationsService } from './print-stations.service';

/**
 * The bridge routes run behind the app's real global guards. They are @Public to the JWT guard and
 * authenticated by the station token instead, so this proves the two cannot be mixed up.
 */
describe('print bridge over HTTP, behind the global JWT and tenant guards', () => {
  let app: INestApplication;
  const jobs = { claim: jest.fn().mockResolvedValue([{ id: 'j1' }]), complete: jest.fn().mockResolvedValue({ status: 'SENT' }) };
  const stations = { authenticate: jest.fn(), list: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PrintBridgeController, PrintStationsController],
      providers: [
        PrintStationGuard,
        { provide: PrintJobsService, useValue: jobs },
        { provide: PrintStationsService, useValue: stations },
        { provide: PrismaService, useValue: {} },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: TenantGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it('rejects a bridge request with no token', async () => {
    stations.authenticate.mockResolvedValue(null);
    await request(app.getHttpServer()).post('/print-bridge/claim').send({}).expect(401);
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it('rejects a revoked or unknown token', async () => {
    stations.authenticate.mockResolvedValue(null);
    await request(app.getHttpServer()).post('/print-bridge/claim').set('x-print-station-token', 'pst_revoked').send({}).expect(401);
  });

  it('a valid token claims jobs for ITS OWN store only, whatever the body says', async () => {
    stations.authenticate.mockResolvedValue({ id: 'st1', businessId: 'biz-A', storeId: 'store-A' });
    const res = await request(app.getHttpServer())
      .post('/print-bridge/claim')
      .set('x-print-station-token', 'pst_good')
      .send({ limit: 3, storeId: 'store-OF-ANOTHER-BUSINESS', businessId: 'biz-B' })
      .expect(201);
    expect(res.body).toEqual([{ id: 'j1' }]);
    expect(jobs.claim).toHaveBeenCalledWith('store-A', 'st1', 3, { id: 'station:st1', businessId: 'biz-A', role: 'STATION' });
  });

  it('a valid token reports a result as that station', async () => {
    stations.authenticate.mockResolvedValue({ id: 'st1', businessId: 'biz-A', storeId: 'store-A' });
    await request(app.getHttpServer())
      .post('/print-bridge/j1/result')
      .set('x-print-station-token', 'pst_good')
      .send({ ok: false, error: 'ECONNREFUSED' })
      .expect(201);
    expect(jobs.complete).toHaveBeenCalledWith('j1', { ok: false, error: 'ECONNREFUSED' }, 'st1', expect.objectContaining({ businessId: 'biz-A' }));
  });

  it('the station-management routes are NOT public: a station token does not open them', async () => {
    stations.authenticate.mockResolvedValue({ id: 'st1', businessId: 'biz-A', storeId: 'store-A' });
    const res = await request(app.getHttpServer()).get('/print-stations?storeId=store-A').set('x-print-station-token', 'pst_good');
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(stations.list).not.toHaveBeenCalled();
  });
});
