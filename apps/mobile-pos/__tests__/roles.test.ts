import {
  canManage,
  canManageBusiness,
  canSeeFinance,
  canApprove,
  canSeeAllSales,
  MANAGE_ROLES,
  FINANCE_ROLES,
} from '../lib/roles';

describe('canManage', () => {
  it('allows owner, manager and admin (case-insensitive)', () => {
    expect(canManage('OWNER')).toBe(true);
    expect(canManage('MANAGER')).toBe(true);
    expect(canManage('ADMIN')).toBe(true);
    expect(canManage('owner')).toBe(true);
    expect(canManage('Manager')).toBe(true);
  });

  it('denies cashier, waiter and other floor roles', () => {
    expect(canManage('CASHIER')).toBe(false);
    expect(canManage('WAITER')).toBe(false);
    expect(canManage('KITCHEN')).toBe(false);
    expect(canManage('ACCOUNTANT')).toBe(false);
  });

  it('denies when role is missing', () => {
    expect(canManage(undefined)).toBe(false);
    expect(canManage(null)).toBe(false);
    expect(canManage('')).toBe(false);
  });

  it('exposes exactly the three management roles', () => {
    expect([...MANAGE_ROLES]).toEqual(['OWNER', 'MANAGER', 'ADMIN']);
  });
});

describe('canManageBusiness', () => {
  it('restricts staff/settings to owner and admin only', () => {
    expect(canManageBusiness('OWNER')).toBe(true);
    expect(canManageBusiness('ADMIN')).toBe(true);
    expect(canManageBusiness('MANAGER')).toBe(false);
    expect(canManageBusiness('CASHIER')).toBe(false);
    expect(canManageBusiness(undefined)).toBe(false);
  });
});

describe('canSeeFinance', () => {
  // The whole point of this gate: web grants ACCOUNTANT the Finance group, so
  // mobile must too, without also handing them stock and staff tools.
  it('includes accountant alongside the management roles', () => {
    expect(canSeeFinance('ACCOUNTANT')).toBe(true);
    expect(canSeeFinance('OWNER')).toBe(true);
    expect(canSeeFinance('MANAGER')).toBe(true);
    expect(canSeeFinance('ADMIN')).toBe(true);
  });

  it('still excludes floor roles', () => {
    expect(canSeeFinance('CASHIER')).toBe(false);
    expect(canSeeFinance('WAITER')).toBe(false);
    expect(canSeeFinance(undefined)).toBe(false);
  });

  it('is a strict superset of canManage', () => {
    for (const r of MANAGE_ROLES) expect(canSeeFinance(r)).toBe(true);
    expect(FINANCE_ROLES.length).toBe(MANAGE_ROLES.length + 1);
  });
});

describe('canApprove', () => {
  it('lets managers approve but not accountants — seeing money is not spending it', () => {
    expect(canApprove('OWNER')).toBe(true);
    expect(canApprove('MANAGER')).toBe(true);
    expect(canApprove('ACCOUNTANT')).toBe(false);
    expect(canApprove('CASHIER')).toBe(false);
  });
});

describe('canSeeAllSales', () => {
  it('keeps a cashier out of their colleagues takings', () => {
    expect(canSeeAllSales('CASHIER')).toBe(false);
    expect(canSeeAllSales('WAITER')).toBe(false);
    expect(canSeeAllSales('MANAGER')).toBe(true);
    expect(canSeeAllSales('ACCOUNTANT')).toBe(true);
  });
});
