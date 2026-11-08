import { generateLicenseKeyPair, verifyLicense } from './license-token';
import { LicenseAuthorityService } from './license-authority.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-08T12:00:00Z');
const keys = generateLicenseKeyPair();

type Row = { id: string; key: string; tier: string; isActive: boolean; expiresAt: Date | null; machineId: string | null; hostname: string | null; boundAt: Date | null; activatedAt: Date | null; lastSeenAt: Date | null };

function setup(rows: Partial<Row>[]) {
  const table: Row[] = rows.map((r, i) => ({ id: `k${i}`, key: `KPS-AAAA-BBBB-CC0${i}`, tier: 'PRO', isActive: true, expiresAt: null, machineId: null, hostname: null, boundAt: null, activatedAt: null, lastSeenAt: null, ...r }));
  const prisma = {
    licenseKey: {
      findFirst: jest.fn(async ({ where }: any) => table.find((r) => r.key.toLowerCase() === String(where.key.equals).toLowerCase()) ?? null),
      findUnique: jest.fn(async ({ where }: any) => table.find((r) => r.id === where.id) ?? null),
      update: jest.fn(async ({ where, data }: any) => { Object.assign(table.find((r) => r.id === where.id)!, data); }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = table.find((x) => x.id === where.id && x.machineId === where.machineId);
        if (!r) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
    },
  };
  return { svc: new LicenseAuthorityService(prisma as any), table, prisma };
}
const body = (over = {}) => ({ key: 'KPS-AAAA-BBBB-CC00', machineId: 'machine-aaaa-1111', hostname: 'SHOP-PC', ...over });
const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e: any) { return e.getResponse?.().code ?? e.message; } };

describe('the licence authority', () => {
  beforeEach(() => { process.env.LICENSE_SIGNING_PRIVATE_KEY = keys.privateKeyPem; });
  afterAll(() => { delete process.env.LICENSE_SIGNING_PRIVATE_KEY; });

  it('activating binds the key to that computer and returns a token that verifies and names the computer', async () => {
    const { svc, table } = setup([{ tier: 'PRO' }]);
    const r = await svc.activate(body(), NOW);
    expect(table[0].machineId).toBe('machine-aaaa-1111');
    expect(table[0].boundAt).toEqual(NOW);
    const v = verifyLicense(r.token, keys.publicKeyPem);
    expect(v.ok && v.payload.machineId).toBe('machine-aaaa-1111');
    expect(v.ok && v.payload.tier).toBe('PRO');
    expect(r.tokenExpiresAt).toBe(new Date(NOW.getTime() + 30 * DAY).toISOString());
  });

  it('the key is matched without regard to case (admin keys are lower case, paid keys upper case)', async () => {
    const { svc } = setup([{ key: 'KPS-abcd1234-abcd1234-abcd1234' }]);
    expect(await code(svc.activate(body({ key: ' kps-ABCD1234-ABCD1234-ABCD1234 ' }), NOW))).toBe('OK');
  });

  it('a token never outlives the licence: a licence ending in 5 days gets a 5-day token', async () => {
    const ends = new Date(NOW.getTime() + 5 * DAY);
    const { svc } = setup([{ expiresAt: ends }]);
    const r = await svc.activate(body(), NOW);
    expect(r.tokenExpiresAt).toBe(ends.toISOString());
    expect(r.licenseExpiresAt).toBe(ends.toISOString());
  });

  it('a second computer is refused, and the first keeps working', async () => {
    const { svc } = setup([{}]);
    await svc.activate(body(), NOW);
    expect(await code(svc.activate(body({ machineId: 'another-machine-2222' }), NOW))).toBe('OTHER_COMPUTER');
    expect(await code(svc.renew(body({ machineId: 'another-machine-2222' }), NOW))).toBe('OTHER_COMPUTER');
    expect(await code(svc.renew(body(), NOW))).toBe('OK');
  });

  it('two computers activating at the same moment: exactly one wins', async () => {
    const { svc, table } = setup([{}]);
    const [a, b] = await Promise.all([code(svc.activate(body({ machineId: 'machine-aaaa-1111' }), NOW)), code(svc.activate(body({ machineId: 'machine-bbbb-2222' }), NOW))]);
    expect([a, b].sort()).toEqual(['OK', 'OTHER_COMPUTER']);
    expect(['machine-aaaa-1111', 'machine-bbbb-2222']).toContain(table[0].machineId);
  });

  it('the same computer can activate again (re-install) and gets a fresh token', async () => {
    const { svc } = setup([{}]);
    await svc.activate(body(), NOW);
    expect(await code(svc.activate(body(), new Date(NOW.getTime() + DAY)))).toBe('OK');
  });

  it('a cancelled key gets nothing new', async () => {
    const { svc } = setup([{ isActive: false }]);
    expect(await code(svc.activate(body(), NOW))).toBe('REVOKED');
    const bound = setup([{ machineId: 'machine-aaaa-1111', isActive: false }]);
    expect(await code(bound.svc.renew(body(), NOW))).toBe('REVOKED');
  });

  it('an ended licence gets nothing new', async () => {
    const { svc } = setup([{ expiresAt: new Date(NOW.getTime() - DAY), machineId: 'machine-aaaa-1111' }]);
    expect(await code(svc.renew(body(), NOW))).toBe('EXPIRED');
  });

  it('renewing a key that was never activated says so', async () => {
    const { svc } = setup([{}]);
    expect(await code(svc.renew(body(), NOW))).toBe('NOT_ACTIVATED');
  });

  it('an unknown key and bad input are told apart', async () => {
    const { svc } = setup([{}]);
    expect(await code(svc.activate(body({ key: 'KPS-NOPE-NOPE-NOPE' }), NOW))).toBe('UNKNOWN_KEY');
    expect(await code(svc.activate(body({ key: 'x' }), NOW))).toBe('BAD_KEY');
    expect(await code(svc.activate(body({ machineId: 'short' }), NOW))).toBe('BAD_MACHINE');
  });

  it('LIFETIME is issued as the top plan', async () => {
    const { svc } = setup([{ tier: 'LIFETIME' }]);
    const r = await svc.activate(body(), NOW);
    expect(r.tier).toBe('ENTERPRISE');
  });

  it('an admin can release the key so a replacement computer can activate it', async () => {
    const { svc, table } = setup([{}]);
    await svc.activate(body(), NOW);
    await svc.release('k0');
    expect(table[0].machineId).toBeNull();
    expect(await code(svc.activate(body({ machineId: 'new-computer-3333' }), NOW))).toBe('OK');
  });

  it('refuses cleanly when this server has no signing key (never issues an unsigned licence)', async () => {
    delete process.env.LICENSE_SIGNING_PRIVATE_KEY;
    const { svc } = setup([{}]);
    expect(await code(svc.activate(body(), NOW))).toBe('NOT_CONFIGURED');
  });
});
