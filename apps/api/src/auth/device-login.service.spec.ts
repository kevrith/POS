import { UnauthorizedException } from '@nestjs/common';
import { DeviceLoginService } from './device-login.service';

function setup() {
  const rows: any[] = [];
  const prisma: any = {
    userSession: {
      create: jest.fn(async ({ data }) => { const r = { id: `s${rows.length + 1}`, createdAt: new Date(rows.length), isRevoked: false, ...data }; rows.push(r); return r; }),
      findMany: jest.fn(async () => [...rows].filter((r) => !r.isRevoked).reverse()),
      findUnique: jest.fn(async ({ where }) => {
        const r = rows.find((x) => x.id === where.id);
        return r && { ...r, user: { id: 'u1', name: 'Joy', email: null, role: 'CASHIER', businessId: 'b1', assignedStores: [{ storeId: 'st1' }] } };
      }),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async ({ where, data }) => {
        rows.forEach((r) => {
          const idOk = !where.id || (where.id.in ? where.id.in.includes(r.id) : where.id === r.id);
          if (idOk && (!where.userId || r.userId === where.userId)) Object.assign(r, data);
        });
      }),
    },
    business: { findUnique: jest.fn(async () => ({ planName: 'GROWTH', subscriptionTier: 'GROWTH', subscriptionStatus: 'ACTIVE', trialEndsAt: null })) },
  };
  const jwt: any = { sign: jest.fn(() => 'jwt') };
  return { svc: new DeviceLoginService(prisma, jwt), rows, jwt };
}

describe('DeviceLoginService', () => {
  it('stores only a hash, and the token it hands out signs the user back in', async () => {
    const { svc, rows } = setup();
    const { deviceToken } = await svc.enrol('u1', 'Pixel');
    const secret = deviceToken.split('.')[1];
    expect(JSON.stringify(rows)).not.toContain(secret);
    const res = await svc.login(deviceToken);
    expect(res.accessToken).toBe('jwt');
    expect(res.user).toMatchObject({ id: 'u1', storeId: 'st1', subscriptionTier: 'GROWTH' });
  });

  it('rejects a wrong secret, a malformed token and a revoked one', async () => {
    const { svc } = setup();
    const { deviceToken } = await svc.enrol('u1');
    const id = deviceToken.split('.')[0];
    await expect(svc.login(`${id}.wrong`)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.login('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.login(undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    await svc.revoke('u1', deviceToken);
    await expect(svc.login(deviceToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const { svc, rows } = setup();
    const { deviceToken } = await svc.enrol('u1');
    rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(svc.login(deviceToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps only the five newest phones per user', async () => {
    const { svc, rows } = setup();
    for (let i = 0; i < 7; i++) await svc.enrol('u1', `p${i}`);
    expect(rows.filter((r) => !r.isRevoked)).toHaveLength(5);
  });
});
