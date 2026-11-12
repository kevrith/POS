import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShaService } from './sha.service';
import { sealSecret } from '../../common/secret-box';

const ACTOR = { id: 'u-1', name: 'Peter' };
const BASE = 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1';

beforeAll(() => { process.env.ENCRYPTION_KEY = 'ab'.repeat(32); });

function conn(o: Record<string, unknown> = {}) {
  return { id: 'sc-1', businessId: 'biz-1', baseUrl: BASE, clientId: 'cid-123', clientSecretEnc: sealSecret('the-secret'), facilityCode: 'FID-47-1', tokenPath: '/tenants/token', eligibilityPath: '/patients/eligibility', tokenFormat: 'json', enabled: true, updatedAt: new Date('2026-11-12T10:00:00Z'), lastTestAt: null, lastTestOk: null, lastTestMessage: null, ...o };
}
const reply = (status: number, body: unknown) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });

function setup(c: Record<string, unknown> | null = conn()) {
  const prisma: any = {
    shaConnection: { findFirst: jest.fn().mockResolvedValue(c), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pt-1' }) },
    insuranceProvider: { findFirst: jest.fn().mockResolvedValue({ id: 'sha' }) },
  };
  const cover: any = { recordCheck: jest.fn().mockImplementation(async (_b: string, d: any) => ({ id: `chk-${d.memberNumber}`, ...d })) };
  const svc = new ShaService(prisma, cover);
  const http = jest.fn();
  svc.http = http as never;
  return { prisma, cover, svc, http };
}
const ELIGIBLE = { fullName: 'Jane Doe', memberCrNumber: 'CR-777', isAlive: true, schemes: [{ schemeName: 'SHIF', coverage: { status: 'Active' } }] };
const dto = { patientId: 'pt-1', providerId: 'sha', identificationType: 'National ID', identificationNumber: '12345678', visitId: 'v-1' };

describe('ShaService settings', () => {
  it('stores the secret encrypted, tidies the address, and never sends the secret back', async () => {
    const { svc, prisma } = setup(null);
    prisma.shaConnection.findFirst.mockResolvedValueOnce(null).mockResolvedValue(conn());
    const out: any = await svc.saveConfig('biz-1', { baseUrl: `${BASE}/`, clientId: ' cid-123 ', clientSecret: 'the-secret', facilityCode: 'FID-47-1' }, ACTOR);
    const data = prisma.shaConnection.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ businessId: 'biz-1', baseUrl: BASE, clientId: 'cid-123', facilityCode: 'FID-47-1', tokenPath: '/tenants/token', eligibilityPath: '/patients/eligibility', tokenFormat: 'json', enabled: true, updatedBy: 'Peter' });
    expect(data.clientSecretEnc).not.toContain('the-secret');
    expect(JSON.stringify(out)).not.toContain('the-secret');
    expect(JSON.stringify(out)).not.toContain(data.clientSecretEnc);
    expect(out.connection.secretSet).toBe(true);
  });

  it('a first save needs the secret, a later one may leave it blank to keep it, and a change clears the last test', async () => {
    const a = setup(null);
    await expect(a.svc.saveConfig('biz-1', { baseUrl: BASE, clientId: 'c', facilityCode: 'f' }, ACTOR)).rejects.toThrow(/client secret/);
    const b = setup();
    await b.svc.saveConfig('biz-1', { baseUrl: BASE, clientId: 'c2', facilityCode: 'f' }, ACTOR);
    const data = b.prisma.shaConnection.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('clientSecretEnc');
    expect(data).toMatchObject({ clientId: 'c2', lastTestAt: null, lastTestOk: null });
  });

  it('refuses an address that is not SHA\'s or DHA\'s, plain http, and odd paths', async () => {
    const { svc, prisma } = setup(null);
    for (const bad of [{ baseUrl: 'https://example.com/api' }, { baseUrl: 'http://ilm-dev.dha.go.ke/api' }, { baseUrl: 'https://127.0.0.1/api' }, { tokenPath: 'tenants/token' }, { eligibilityPath: '/a/../b' }, { tokenFormat: 'xml' }]) {
      await expect(svc.saveConfig('biz-1', { baseUrl: BASE, clientId: 'c', clientSecret: 's', facilityCode: 'f', ...bad }, ACTOR)).rejects.toThrow(BadRequestException);
    }
    expect(prisma.shaConnection.create).not.toHaveBeenCalled();
  });

  it('refuses to store a secret when the server has no key', async () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    const { svc } = setup(null);
    await expect(svc.saveConfig('biz-1', { baseUrl: BASE, clientId: 'c', clientSecret: 's', facilityCode: 'f' }, ACTOR)).rejects.toThrow(/encryption key/);
    process.env.ENCRYPTION_KEY = saved;
  });

  it('reports whether SHA is connected without revealing anything', async () => {
    expect(await setup().svc.status('biz-1')).toEqual({ configured: true, enabled: true });
    expect(await setup(null).svc.status('biz-1')).toEqual({ configured: false, enabled: false });
  });
});

describe('ShaService.test', () => {
  it('signs in with the credentials as JSON and records that it worked', async () => {
    const { svc, http, prisma } = setup();
    http.mockResolvedValue(reply(200, { access_token: 'tok-1', expires_in: 3600 }));
    const r = await svc.test('biz-1');
    expect(r.ok).toBe(true);
    const [url, init] = http.mock.calls[0];
    expect(url).toBe(`${BASE}/tenants/token`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ client_id: 'cid-123', client_secret: 'the-secret' });
    expect(prisma.shaConnection.updateMany).toHaveBeenCalledWith({ where: { id: 'sc-1', businessId: 'biz-1' }, data: expect.objectContaining({ lastTestOk: true }) });
  });

  it('can send the sign-in as a form instead', async () => {
    const { svc, http } = setup(conn({ tokenFormat: 'form' }));
    http.mockResolvedValue(reply(200, { access_token: 't' }));
    await svc.test('biz-1');
    expect(http.mock.calls[0][1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(http.mock.calls[0][1].body).toBe('client_id=cid-123&client_secret=the-secret');
  });

  it('says plainly when the credentials are refused, there is no token, or SHA cannot be reached, and records it', async () => {
    const a = setup();
    a.http.mockResolvedValue(reply(401, { message: 'bad' }));
    expect(await a.svc.test('biz-1')).toMatchObject({ ok: false, message: expect.stringContaining('did not accept') });
    expect(a.prisma.shaConnection.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastTestOk: false }) }));
    const b = setup();
    b.http.mockResolvedValue(reply(200, { nothing: true }));
    expect(await b.svc.test('biz-1')).toMatchObject({ ok: false, message: expect.stringContaining('no access token') });
    const c = setup();
    c.http.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await c.svc.test('biz-1')).toMatchObject({ ok: false, message: expect.stringContaining('could not be reached') });
    const d = setup(null);
    await expect(d.svc.test('biz-1')).rejects.toThrow(NotFoundException);
  });

  it('never puts the secret in what it tells the user or stores', async () => {
    const { svc, http, prisma } = setup();
    http.mockResolvedValue(reply(401, { echoed: 'the-secret' }));
    const r = await svc.test('biz-1');
    expect(JSON.stringify(r)).not.toContain('the-secret');
    expect(JSON.stringify(prisma.shaConnection.updateMany.mock.calls)).not.toContain('the-secret');
  });
});

describe('ShaService.checkEligibility', () => {
  const sign = (http: jest.Mock, answer: ReturnType<typeof reply>) => http.mockImplementation(async (url: string) => (url.includes('/tenants/token') ? reply(200, { access_token: 'tok-1', expires_in: 3600 }) : answer));

  it('asks SHA the documented way and records an eligible answer under the number typed and SHA\'s own number', async () => {
    const { svc, http, cover } = setup();
    sign(http, reply(200, ELIGIBLE));
    const r: any = await svc.checkEligibility('biz-1', dto, ACTOR);
    const [url, init] = http.mock.calls[1];
    expect(url).toBe(`${BASE}/patients/eligibility?identification_number=12345678&identification_type=National%20ID`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'X-Facility-Id': 'FID-47-1', 'X-Facility-Id-Type': 'fr-code' });
    expect(r).toMatchObject({ recorded: true, verdict: 'ELIGIBLE', status: 'ELIGIBLE', memberCrNumber: 'CR-777' });
    expect(cover.recordCheck).toHaveBeenCalledTimes(2);
    expect(cover.recordCheck).toHaveBeenCalledWith('biz-1', expect.objectContaining({ patientId: 'pt-1', providerId: 'sha', visitId: 'v-1', memberNumber: '12345678', status: 'ELIGIBLE', reference: 'CR CR-777' }), ACTOR, 'SHA_API');
    expect(cover.recordCheck).toHaveBeenCalledWith('biz-1', expect.objectContaining({ memberNumber: 'CR-777' }), ACTOR, 'SHA_API');
  });

  it('records not eligible for an inactive member, and for a person SHA has no record of', async () => {
    const a = setup();
    sign(a.http, reply(200, { ...ELIGIBLE, schemes: [{ schemeName: 'SHIF', coverage: { status: 'Inactive', reason: 'Contributions overdue' } }] }));
    expect(await a.svc.checkEligibility('biz-1', dto, ACTOR)).toMatchObject({ recorded: true, status: 'NOT_ELIGIBLE' });
    const b = setup();
    sign(b.http, reply(404, { message: 'not found' }));
    const r: any = await b.svc.checkEligibility('biz-1', dto, ACTOR);
    expect(r).toMatchObject({ recorded: true, status: 'NOT_ELIGIBLE' });
    expect(r.summary).toContain('no record');
    expect(b.cover.recordCheck).toHaveBeenCalledTimes(1);
  });

  it('an answer it cannot read is recorded as could-not-check with what SHA said, never as eligible', async () => {
    const { svc, http, cover } = setup();
    sign(http, reply(200, { ...ELIGIBLE, schemes: [{ schemeName: 'SHIF', coverage: { status: 'PENDING REVIEW' } }] }));
    const r: any = await svc.checkEligibility('biz-1', dto, ACTOR);
    expect(r).toMatchObject({ recorded: true, verdict: 'UNKNOWN', status: 'UNAVAILABLE' });
    expect(r.message).toMatch(/could not be read/);
    expect(cover.recordCheck).toHaveBeenCalledWith('biz-1', expect.objectContaining({ status: 'UNAVAILABLE', notes: expect.stringContaining('PENDING REVIEW') }), ACTOR, 'SHA_API');
  });

  it('a person recorded as deceased is not eligible', async () => {
    const { svc, http } = setup();
    sign(http, reply(200, { ...ELIGIBLE, isAlive: false }));
    expect(await svc.checkEligibility('biz-1', dto, ACTOR)).toMatchObject({ status: 'NOT_ELIGIBLE' });
  });

  it('records nothing when SHA refuses the credentials, rejects the identifier, is down or cannot be reached', async () => {
    for (const [status, kind] of [[401, 'AUTH'], [400, 'BAD_INPUT'], [503, 'DOWN']] as const) {
      const { svc, http, cover } = setup();
      http.mockImplementation(async (url: string) => (url.includes('/tenants/token') ? reply(200, { access_token: 't' }) : reply(status, {})));
      const r: any = await svc.checkEligibility('biz-1', dto, ACTOR);
      expect(r).toMatchObject({ recorded: false, verdict: kind });
      expect(cover.recordCheck).not.toHaveBeenCalled();
    }
    const { svc, http, cover } = setup();
    http.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await svc.checkEligibility('biz-1', dto, ACTOR)).toMatchObject({ recorded: false, verdict: 'UNREACHABLE' });
    expect(cover.recordCheck).not.toHaveBeenCalled();
  });

  it('a failure to sign in records nothing and says where to look', async () => {
    const { svc, http, cover } = setup();
    http.mockResolvedValue(reply(401, {}));
    const r: any = await svc.checkEligibility('biz-1', dto, ACTOR);
    expect(r).toMatchObject({ recorded: false, verdict: 'AUTH', message: expect.stringContaining('SHA connection') });
    expect(cover.recordCheck).not.toHaveBeenCalled();
  });

  it('replaces an expired token once and tries again, and reuses a good token across checks', async () => {
    const a = setup();
    let first = true;
    a.http.mockImplementation(async (url: string) => {
      if (url.includes('/tenants/token')) return reply(200, { access_token: first ? 'old' : 'new', expires_in: 3600 });
      if (first) { first = false; return reply(401, {}); }
      return reply(200, ELIGIBLE);
    });
    expect(await a.svc.checkEligibility('biz-1', dto, ACTOR)).toMatchObject({ recorded: true, status: 'ELIGIBLE' });
    const b = setup();
    sign(b.http, reply(200, ELIGIBLE));
    await b.svc.checkEligibility('biz-1', dto, ACTOR);
    await b.svc.checkEligibility('biz-1', { ...dto, identificationNumber: '87654321' }, ACTOR);
    expect(b.http.mock.calls.filter(([u]: [string]) => u.includes('/tenants/token'))).toHaveLength(1);
  });

  it('needs SHA to be connected and enabled, a real identifier, a patient and an insurer set up as SHA', async () => {
    await expect(setup(null).svc.checkEligibility('biz-1', dto, ACTOR)).rejects.toThrow(/not connected/);
    await expect(setup(conn({ enabled: false })).svc.checkEligibility('biz-1', dto, ACTOR)).rejects.toThrow(/not connected/);
    const a = setup();
    await expect(a.svc.checkEligibility('biz-1', { ...dto, identificationType: 'Passport' }, ACTOR)).rejects.toThrow(/Identifier type/);
    await expect(a.svc.checkEligibility('biz-1', { ...dto, identificationNumber: '1' }, ACTOR)).rejects.toThrow(/identifier number/);
    a.prisma.patient.findFirst.mockResolvedValue(null);
    await expect(a.svc.checkEligibility('biz-1', dto, ACTOR)).rejects.toThrow(NotFoundException);
    const b = setup();
    b.prisma.insuranceProvider.findFirst.mockResolvedValue(null);
    await expect(b.svc.checkEligibility('biz-1', dto, ACTOR)).rejects.toThrow(/not set up as SHA/);
    expect(b.http).not.toHaveBeenCalled();
  });

  it('encodes what was typed so it cannot change the request', async () => {
    const { svc, http } = setup();
    sign(http, reply(200, ELIGIBLE));
    await svc.checkEligibility('biz-1', { ...dto, identificationNumber: '123 456' }, ACTOR);
    expect(http.mock.calls[1][0]).toContain('identification_number=123%20456&');
  });
});
