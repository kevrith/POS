import { ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  ACCESS_RULES,
  ALL_ROLES,
  assertCanManageUser,
  evaluateAccess,
  matchesPattern,
  normalizePath,
} from './access-policy';

const can = (role: string, method: string, path: string) =>
  evaluateAccess(role, method, `/api/v1${path}`).allowed;

describe('normalizePath / matchesPattern', () => {
  it('strips the global prefix, query string and trailing slash', () => {
    expect(normalizePath('/api/v1/business/b1/users/?x=1')).toBe('/business/b1/users');
    expect(normalizePath('/health')).toBe('/health');
  });

  it(':x and * match one segment, ** matches the tail', () => {
    expect(matchesPattern('/business/:id/users', '/business/b1/users')).toBe(true);
    expect(matchesPattern('/business/:id/users', '/business/b1/users/u1')).toBe(false);
    expect(matchesPattern('/business/:id/users/**', '/business/b1/users')).toBe(true);
    expect(matchesPattern('/business/:id/users/**', '/business/b1/users/u1/stores/s1')).toBe(true);
    expect(matchesPattern('/hr/leave', '/hr/leave-balance')).toBe(false);
  });
});

describe('the gaps found in the 2026-11 audit are closed', () => {
  const lowRoles = ['CASHIER', 'WAITER', 'KITCHEN', 'DRIVER', 'SALES_AGENT', 'ACCOUNTANT'];

  it.each(lowRoles)('%s cannot create users, reset PINs or change settings', (role) => {
    expect(can(role, 'POST', '/business/b1/users')).toBe(false);
    expect(can(role, 'PATCH', '/business/b1/users/u1')).toBe(false);
    expect(can(role, 'DELETE', '/business/b1/users/u1')).toBe(false);
    expect(can(role, 'PATCH', '/business/b1/settings')).toBe(false);
    expect(can(role, 'PATCH', '/business/b1/mpesa-credentials')).toBe(false);
  });

  it.each(['CASHIER', 'WAITER', 'KITCHEN', 'DRIVER', 'SALES_AGENT'])(
    '%s cannot read profit and loss or other finance reports',
    (role) => {
      expect(can(role, 'GET', '/reports/profit-loss?businessId=b1')).toBe(false);
      expect(can(role, 'GET', '/reports/gross-margin')).toBe(false);
      expect(can(role, 'GET', '/reports/full-data-export')).toBe(false);
    },
  );

  it('owner-level routes reject managers', () => {
    expect(can('MANAGER', 'PATCH', '/business/b1/mpesa-credentials')).toBe(false);
    expect(can('MANAGER', 'POST', '/payments/mpesa/b2c')).toBe(false);
    expect(can('MANAGER', 'POST', '/api-keys')).toBe(false);
    expect(can('MANAGER', 'PUT', '/security/roles/r1/permissions')).toBe(false);
    expect(can('OWNER', 'PATCH', '/business/b1/mpesa-credentials')).toBe(true);
  });

  it('accountants read finance but cannot approve spend or edit staff', () => {
    expect(can('ACCOUNTANT', 'GET', '/reports/profit-loss')).toBe(true);
    expect(can('ACCOUNTANT', 'PATCH', '/expenses/e1/approve')).toBe(false);
    expect(can('ACCOUNTANT', 'POST', '/business/b1/users')).toBe(false);
  });

  it('the shared SMS account is not open to the floor', () => {
    expect(can('CASHIER', 'POST', '/notifications/sms')).toBe(false);
    expect(can('CASHIER', 'POST', '/notifications/send-receipt')).toBe(true);
    expect(can('MANAGER', 'POST', '/notifications/sms')).toBe(true);
  });
});

describe('legitimate client calls still work', () => {
  it('owner and manager keep management access', () => {
    for (const role of ['OWNER', 'MANAGER']) {
      expect(can(role, 'POST', '/business/b1/users')).toBe(true);
      expect(can(role, 'PATCH', '/business/b1/settings')).toBe(true);
      expect(can(role, 'GET', '/reports/profit-loss')).toBe(true);
      expect(can(role, 'POST', '/inventory/adjustment')).toBe(true);
    }
  });

  it('cashier and waiter keep the till', () => {
    for (const role of ['CASHIER', 'WAITER']) {
      expect(can(role, 'POST', '/sales/checkout')).toBe(true);
      expect(can(role, 'GET', '/items?businessId=b1')).toBe(true);
      expect(can(role, 'GET', '/business/b1/settings')).toBe(true);
      expect(can(role, 'GET', '/business/b1/users')).toBe(true);
      expect(can(role, 'POST', '/payments/mpesa/stk-push')).toBe(true);
      expect(can(role, 'POST', '/cash-drawer/open')).toBe(true);
      expect(can(role, 'GET', '/reports/x-report')).toBe(true);
      expect(can(role, 'GET', '/reports/sales')).toBe(true);
      expect(can(role, 'POST', '/hr/time-entries/clock-in')).toBe(true);
      expect(can(role, 'POST', '/hr/leave')).toBe(true);
      expect(can(role, 'POST', '/hospitality/orders')).toBe(true);
    }
  });

  it('staff cannot approve leave or run payroll', () => {
    expect(can('CASHIER', 'PATCH', '/hr/leave/l1/approve')).toBe(false);
    expect(can('CASHIER', 'POST', '/hr/payroll')).toBe(false);
    expect(can('MANAGER', 'PATCH', '/hr/leave/l1/approve')).toBe(true);
  });

  it('the driver app calls', () => {
    expect(can('DRIVER', 'GET', '/delivery?businessId=b1&status=ALL')).toBe(true);
    expect(can('DRIVER', 'GET', '/delivery/d1')).toBe(true);
    expect(can('DRIVER', 'PATCH', '/delivery/d1')).toBe(true);
    expect(can('DRIVER', 'POST', '/delivery/driver-location')).toBe(true);
    expect(can('DRIVER', 'GET', '/delivery/driver-earnings/u1')).toBe(true);
    expect(can('DRIVER', 'POST', '/push/register')).toBe(true);
    expect(can('DRIVER', 'POST', '/auth/refresh')).toBe(true);
  });

  it('a driver cannot dispatch, configure zones or leave the delivery area', () => {
    expect(can('DRIVER', 'PUT', '/delivery/orders/o1/assign-driver')).toBe(false);
    expect(can('DRIVER', 'POST', '/delivery/zones')).toBe(false);
    expect(can('DRIVER', 'GET', '/delivery/driver-locations')).toBe(false);
    expect(can('DRIVER', 'GET', '/items')).toBe(false);
    expect(can('DRIVER', 'GET', '/sales')).toBe(false);
  });

  it('the sales agent app calls', () => {
    expect(can('SALES_AGENT', 'GET', '/field-sales/customers?agentId=a1')).toBe(true);
    expect(can('SALES_AGENT', 'POST', '/field-sales/customers')).toBe(true);
    expect(can('SALES_AGENT', 'POST', '/field-sales/orders')).toBe(true);
    expect(can('SALES_AGENT', 'POST', '/field-sales/orders/o1/collect-payment')).toBe(true);
    expect(can('SALES_AGENT', 'GET', '/field-sales/agent-stats')).toBe(true);
    expect(can('SALES_AGENT', 'GET', '/items?businessId=b1&activeOnly=true')).toBe(true);
  });

  it('a sales agent cannot approve credit, build routes or touch other modules', () => {
    expect(can('SALES_AGENT', 'PATCH', '/field-sales/credit-requests/c1/review')).toBe(false);
    expect(can('SALES_AGENT', 'POST', '/field-sales/routes')).toBe(false);
    expect(can('SALES_AGENT', 'PATCH', '/field-sales/orders/o1/status')).toBe(false);
    expect(can('SALES_AGENT', 'POST', '/items')).toBe(false);
    expect(can('SALES_AGENT', 'POST', '/sales/checkout')).toBe(false);
  });

  it('kitchen reaches the KDS and nothing financial', () => {
    expect(can('KITCHEN', 'GET', '/hospitality/kds/orders?storeId=s1')).toBe(true);
    expect(can('KITCHEN', 'PATCH', '/hospitality/kot/k1/status')).toBe(true);
    expect(can('KITCHEN', 'PATCH', '/items/i1/86')).toBe(true);
    expect(can('KITCHEN', 'POST', '/sales/checkout')).toBe(false);
    expect(can('KITCHEN', 'GET', '/business/b1/users')).toBe(false);
  });

  it('routes with no rule stay open to non-narrow staff', () => {
    expect(can('CASHIER', 'GET', '/some/unclassified/route')).toBe(true);
    expect(can('DRIVER', 'GET', '/some/unclassified/route')).toBe(false);
  });
});

describe('rule table hygiene', () => {
  it('only names roles that exist', () => {
    for (const rule of ACCESS_RULES) {
      for (const role of rule.roles) {
        expect(ALL_ROLES as readonly string[]).toContain(role);
      }
    }
  });

  it('never lists a more general rule ahead of a more specific one it would shadow', () => {
    ACCESS_RULES.forEach((later, j) => {
      ACCESS_RULES.slice(0, j).forEach((earlier) => {
        const sameMethods =
          !earlier.methods ||
          (later.methods && later.methods.every((m) => earlier.methods!.includes(m)));
        const earlierCoversLater =
          sameMethods &&
          earlier.path.endsWith('/**') &&
          matchesPattern(earlier.path, later.path.replace(/\/\*\*$/, '')) &&
          later.path !== earlier.path;
        if (earlierCoversLater) {
          expect({ shadowed: later.path, by: earlier.path, sameRoles: later.roles }).toEqual(
            expect.objectContaining({ sameRoles: earlier.roles }),
          );
        }
      });
    });
  });
});

describe('assertCanManageUser', () => {
  it('owner may do anything with a real role', () => {
    expect(() => assertCanManageUser('OWNER', 'MANAGER', 'CASHIER')).not.toThrow();
    expect(() => assertCanManageUser('OWNER', undefined, 'OWNER')).not.toThrow();
  });

  it('manager may manage floor and field staff only', () => {
    expect(() => assertCanManageUser('MANAGER', undefined, 'CASHIER')).not.toThrow();
    expect(() => assertCanManageUser('MANAGER', 'WAITER', 'ACCOUNTANT')).not.toThrow();
    expect(() => assertCanManageUser('MANAGER', 'WAITER', undefined)).not.toThrow();
  });

  it('manager cannot create or promote to owner or manager', () => {
    expect(() => assertCanManageUser('MANAGER', undefined, 'OWNER')).toThrow(ForbiddenException);
    expect(() => assertCanManageUser('MANAGER', 'CASHIER', 'MANAGER')).toThrow(ForbiddenException);
  });

  it("manager cannot reset or delete the owner's or another manager's account", () => {
    expect(() => assertCanManageUser('MANAGER', 'OWNER', undefined)).toThrow(ForbiddenException);
    expect(() => assertCanManageUser('MANAGER', 'ADMIN', undefined)).toThrow(ForbiddenException);
    expect(() => assertCanManageUser('MANAGER', 'MANAGER', undefined)).toThrow(ForbiddenException);
  });

  it('every other role is refused outright', () => {
    for (const role of ['CASHIER', 'WAITER', 'KITCHEN', 'DRIVER', 'SALES_AGENT', 'ACCOUNTANT']) {
      expect(() => assertCanManageUser(role, undefined, 'CASHIER')).toThrow(ForbiddenException);
    }
  });

  it('rejects a role that does not exist', () => {
    expect(() => assertCanManageUser('OWNER', undefined, 'SUPERUSER')).toThrow(BadRequestException);
    expect(() => assertCanManageUser('OWNER', undefined, 'ADMIN')).toThrow(BadRequestException);
  });
});
