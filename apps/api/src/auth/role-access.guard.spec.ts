import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleAccessGuard } from './role-access.guard';

function ctx(
  req: Record<string, unknown>,
  isPublic = false,
): { context: ExecutionContext; guard: RoleAccessGuard } {
  const reflector = { getAllAndOverride: () => isPublic } as unknown as Reflector;
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { context, guard: new RoleAccessGuard(reflector) };
}

const request = (role: string, method: string, url: string, extra: Record<string, unknown> = {}) => ({
  method,
  originalUrl: `/api/v1${url}`,
  query: {} as Record<string, unknown>,
  body: undefined as unknown,
  user: { id: 'u1', role, businessId: 'b1' },
  ...extra,
});

describe('RoleAccessGuard', () => {
  it('lets @Public routes through without a user', () => {
    const { guard, context } = ctx({ method: 'GET', originalUrl: '/api/v1/business/b1/staff' }, true);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses a cashier on a management route with 403', () => {
    const { guard, context } = ctx(request('CASHIER', 'POST', '/business/b1/users'));
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets an owner through', () => {
    const { guard, context } = ctx(request('OWNER', 'POST', '/business/b1/users'));
    expect(guard.canActivate(context)).toBe(true);
  });

  it("fills in a sales agent's own id when the client omits it", () => {
    const req = request('SALES_AGENT', 'GET', '/field-sales/orders');
    const { guard, context } = ctx(req);
    guard.canActivate(context);
    expect(req.query['agentId']).toBe('u1');
  });

  it('refuses a sales agent asking for another agent', () => {
    const req = request('SALES_AGENT', 'GET', '/field-sales/call-plan', { query: { agentId: 'someone-else' } });
    const { guard, context } = ctx(req);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('pins agentId in the body of a new field order', () => {
    const req = request('SALES_AGENT', 'POST', '/field-sales/orders', { body: { items: [] } });
    const { guard, context } = ctx(req);
    guard.canActivate(context);
    expect((req.body as Record<string, unknown>)['agentId']).toBe('u1');
  });

  it("refuses a driver reading another driver's earnings", () => {
    const own = ctx(request('DRIVER', 'GET', '/delivery/driver-earnings/u1'));
    expect(own.guard.canActivate(own.context)).toBe(true);
    const other = ctx(request('DRIVER', 'GET', '/delivery/driver-earnings/u2'));
    expect(() => other.guard.canActivate(other.context)).toThrow(ForbiddenException);
  });

  it('does not touch agentId for managers browsing field sales', () => {
    const req = request('MANAGER', 'GET', '/field-sales/orders');
    const { guard, context } = ctx(req);
    guard.canActivate(context);
    expect(req.query['agentId']).toBeUndefined();
  });
});
