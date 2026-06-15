import { canManage, canManageBusiness, MANAGE_ROLES } from '../lib/roles';

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
