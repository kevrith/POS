import { ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

function makeContext(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function makeGuard(isPublic = false, store: any = undefined) {
  const prisma: any = { store: { findUnique: jest.fn().mockResolvedValue(store) } };
  const reflector: any = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) };
  return { guard: new TenantGuard(prisma, reflector), prisma };
}

const USER = { id: 'u-1', businessId: 'biz-1', role: 'OWNER' };

describe('TenantGuard', () => {
  it('fills in the tenant when the client omits it from the query', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: {}, body: undefined };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

    // Without this, a service doing `where: { businessId }` gets undefined, Prisma
    // drops the key, and the query returns every tenant's rows.
    expect(req.query.businessId).toBe('biz-1');
  });

  it('fills in the tenant on a body that omits it', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: {}, body: { name: 'Item' } };

    await guard.canActivate(makeContext(req));

    expect(req.body.businessId).toBe('biz-1');
  });

  it('leaves a correct businessId untouched', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: { businessId: 'biz-1' }, body: {} };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.query.businessId).toBe('biz-1');
  });

  it('still rejects another business in the query', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: { businessId: 'biz-2' }, body: {} };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('still rejects another business in the body', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: {}, body: { businessId: 'biz-2' } };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('still rejects another business in a path param', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: { businessId: 'biz-2' }, query: {}, body: {} };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow(ForbiddenException);
  });

  it('does not corrupt an array body', async () => {
    const { guard } = makeGuard();
    const req: any = { user: USER, params: {}, query: {}, body: [{ a: 1 }] };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(Array.isArray(req.body)).toBe(true);
    expect(req.body).toEqual([{ a: 1 }]);
  });

  it('leaves public routes alone entirely', async () => {
    const { guard } = makeGuard(true);
    const req: any = { user: undefined, params: {}, query: {}, body: {} };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.query.businessId).toBeUndefined();
  });

  it('rejects an unauthenticated request', async () => {
    const { guard } = makeGuard();
    const req: any = { user: undefined, params: {}, query: {}, body: {} };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(false);
  });

  it('rejects a store belonging to another business', async () => {
    const { guard } = makeGuard(false, { id: 'store-9', businessId: 'biz-2' });
    const req: any = { user: USER, params: {}, query: { storeId: 'store-9' }, body: {} };

    await expect(guard.canActivate(makeContext(req))).rejects.toThrow('Store not in business');
  });
});
