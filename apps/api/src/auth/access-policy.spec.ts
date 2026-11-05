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

describe('vertical modules: fuel, cyber cafe, pharmacy, hotel, appointments', () => {
  describe('fuel station', () => {
    it.each(['CASHIER', 'WAITER'])('%s cannot change prices, credit limits, tank levels or fleet money', (role) => {
      expect(can(role, 'PATCH', '/fuel-pump/grades/g1')).toBe(false);
      expect(can(role, 'POST', '/fuel-pump/grades')).toBe(false);
      expect(can(role, 'PATCH', '/fuel-pump/fleet/f1')).toBe(false);
      expect(can(role, 'POST', '/fuel-pump/fleet')).toBe(false);
      expect(can(role, 'POST', '/fuel-pump/tanks/dipping')).toBe(false);
      expect(can(role, 'POST', '/fuel-pump/tanks/delivery')).toBe(false);
      expect(can(role, 'POST', '/fuel-pump/fleet/f1/payment')).toBe(false);
      expect(can(role, 'GET', '/fuel-pump/variance')).toBe(false);
      expect(can(role, 'GET', '/fuel-pump/fleet/f1/transactions')).toBe(false);
    });

    it('the forecourt attendant can still run pumps, sales and shifts', () => {
      for (const [m, p] of [
        ['POST', '/fuel-pump/sales'],
        ['POST', '/fuel-pump/pumps/p1/authorize'],
        ['POST', '/fuel-pump/pumps/p1/stop'],
        ['POST', '/fuel-pump/shifts/open'],
        ['POST', '/fuel-pump/shifts/s1/close'],
        ['GET', '/fuel-pump/pumps'],
        ['GET', '/fuel-pump/fleet'],
      ] as const) {
        expect({ p, ok: can('CASHIER', m, p) }).toEqual({ p, ok: true });
      }
    });

    it('managers, owners and accountants keep what is theirs', () => {
      expect(can('MANAGER', 'PATCH', '/fuel-pump/grades/g1')).toBe(true);
      expect(can('OWNER', 'POST', '/fuel-pump/tanks/delivery')).toBe(true);
      expect(can('ACCOUNTANT', 'POST', '/fuel-pump/fleet/f1/payment')).toBe(true);
      expect(can('ACCOUNTANT', 'GET', '/fuel-pump/variance')).toBe(true);
    });
  });

  describe('cyber cafe', () => {
    it('front desk runs sessions but cannot void one or touch the rate card', () => {
      expect(can('CASHIER', 'POST', '/cybercafe/stations/s1/start')).toBe(true);
      expect(can('CASHIER', 'POST', '/cybercafe/sessions/x/end')).toBe(true);
      expect(can('CASHIER', 'POST', '/cybercafe/sessions/x/extend')).toBe(true);
      expect(can('CASHIER', 'POST', '/cybercafe/sessions/x/void')).toBe(false);
      expect(can('WAITER', 'POST', '/cybercafe/sessions/x/void')).toBe(false);
      expect(can('CASHIER', 'POST', '/cybercafe/packages')).toBe(false);
      expect(can('CASHIER', 'PATCH', '/cybercafe/stations/s1')).toBe(false);
      expect(can('CASHIER', 'DELETE', '/cybercafe/rates/r1')).toBe(false);
      expect(can('CASHIER', 'GET', '/cybercafe/stats')).toBe(false);
      expect(can('MANAGER', 'POST', '/cybercafe/sessions/x/void')).toBe(true);
    });
  });

  describe('pharmacy', () => {
    it('waiters see no patient data and edit no clinical reference data', () => {
      expect(can('WAITER', 'GET', '/prescriptions')).toBe(false);
      expect(can('WAITER', 'GET', '/prescriptions/rx1')).toBe(false);
      expect(can('WAITER', 'PATCH', '/prescriptions/rx1/dispense')).toBe(false);
      expect(can('WAITER', 'POST', '/pharmacy/interactions')).toBe(false);
      expect(can('WAITER', 'GET', '/pharmacy/drugs')).toBe(false);
    });

    it('counter staff dispense but cannot cancel, edit reference data or work claims', () => {
      expect(can('CASHIER', 'POST', '/prescriptions')).toBe(true);
      expect(can('CASHIER', 'PATCH', '/prescriptions/rx1/dispense')).toBe(true);
      expect(can('CASHIER', 'PATCH', '/prescriptions/rx1/refill')).toBe(true);
      expect(can('CASHIER', 'POST', '/prescriptions/check-interactions')).toBe(true);
      expect(can('CASHIER', 'GET', '/pharmacy/drugs')).toBe(true);
      expect(can('CASHIER', 'PATCH', '/prescriptions/rx1/cancel')).toBe(false);
      expect(can('CASHIER', 'GET', '/prescriptions/controlled-log')).toBe(false);
      expect(can('CASHIER', 'DELETE', '/pharmacy/interactions/i1')).toBe(false);
      expect(can('CASHIER', 'POST', '/pharmacy/drugs')).toBe(false);
      expect(can('CASHIER', 'PATCH', '/pharmacy/claims/c1')).toBe(false);
      expect(can('CASHIER', 'GET', '/pharmacy/claims')).toBe(false);
    });

    it('management and accounts keep claims, the controlled log and cancellations', () => {
      expect(can('MANAGER', 'GET', '/prescriptions/controlled-log')).toBe(true);
      expect(can('MANAGER', 'PATCH', '/prescriptions/rx1/cancel')).toBe(true);
      expect(can('ACCOUNTANT', 'PATCH', '/pharmacy/claims/c1')).toBe(true);
      expect(can('OWNER', 'POST', '/pharmacy/interactions')).toBe(true);
    });
  });

  describe('hotel and appointments', () => {
    it('reception works bookings and the folio, but cannot delete charges or rooms', () => {
      expect(can('CASHIER', 'POST', '/hospitality/room-bookings')).toBe(true);
      expect(can('CASHIER', 'POST', '/hospitality/room-bookings/b1/folio')).toBe(true);
      expect(can('CASHIER', 'POST', '/hospitality/room-bookings/b1/check-out')).toBe(true);
      expect(can('CASHIER', 'DELETE', '/hospitality/folio-charges/c1')).toBe(false);
      expect(can('WAITER', 'DELETE', '/hospitality/folio-charges/c1')).toBe(false);
      expect(can('CASHIER', 'POST', '/hospitality/hotel-rooms')).toBe(false);
      expect(can('CASHIER', 'PATCH', '/hospitality/hotel-rooms/r1')).toBe(false);
      expect(can('CASHIER', 'DELETE', '/hospitality/hotel-rooms/r1')).toBe(false);
      expect(can('MANAGER', 'DELETE', '/hospitality/folio-charges/c1')).toBe(true);
    });

    it('housekeeping can still update a room status', () => {
      expect(can('CASHIER', 'PATCH', '/hospitality/hotel-rooms/r1/housekeeping')).toBe(true);
    });

    it('anyone on the floor books appointments, only management deletes them', () => {
      expect(can('CASHIER', 'POST', '/appointments')).toBe(true);
      expect(can('WAITER', 'PATCH', '/appointments/a1')).toBe(true);
      expect(can('WAITER', 'DELETE', '/appointments/a1')).toBe(false);
      expect(can('MANAGER', 'DELETE', '/appointments/a1')).toBe(true);
    });
  });
});
