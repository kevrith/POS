import { ASSIGNABLE_ROLES, assertCanManageUser, evaluateAccess } from './access-policy';

const can = (role: string, method: string, path: string) => evaluateAccess(role, method, path).allowed;

describe('pharmacist', () => {
  it('works the till and the dispensing counter like a cashier', () => {
    expect(can('PHARMACIST', 'POST', '/sales/checkout')).toBe(true);
    expect(can('PHARMACIST', 'PATCH', '/prescriptions/rx-1/dispense')).toBe(true);
    expect(can('PHARMACIST', 'PATCH', '/prescriptions/rx-1/refill')).toBe(true);
    expect(can('PHARMACIST', 'GET', '/patients')).toBe(true);
    expect(can('PHARMACIST', 'POST', '/patients')).toBe(true);
  });

  it('keeps the drug list, the interaction table, the register and patient records in order', () => {
    expect(can('PHARMACIST', 'POST', '/pharmacy/drugs')).toBe(true);
    expect(can('PHARMACIST', 'POST', '/pharmacy/starter-data')).toBe(true);
    expect(can('PHARMACIST', 'GET', '/prescriptions/controlled-log')).toBe(true);
    expect(can('PHARMACIST', 'PATCH', '/patients/pt-1/active')).toBe(true);
    expect(can('PHARMACIST', 'PATCH', '/prescriptions/rx-1/cancel')).toBe(true);
  });

  it('is not a manager: no staff, no finance, no claims', () => {
    expect(can('PHARMACIST', 'GET', '/pharmacy/claims')).toBe(false);
    expect(can('PHARMACIST', 'POST', '/items')).toBe(false);
  });
});

describe('doctor', () => {
  it('reads patients and writes prescriptions', () => {
    expect(can('DOCTOR', 'GET', '/patients')).toBe(true);
    expect(can('DOCTOR', 'GET', '/patients/pt-1')).toBe(true);
    expect(can('DOCTOR', 'POST', '/patients')).toBe(true);
    expect(can('DOCTOR', 'POST', '/prescriptions')).toBe(true);
    expect(can('DOCTOR', 'POST', '/prescriptions/safety-check')).toBe(true);
    expect(can('DOCTOR', 'GET', '/prescriptions/rx-1/safety')).toBe(true);
    expect(can('DOCTOR', 'GET', '/prescriptions')).toBe(true);
    expect(can('DOCTOR', 'GET', '/pharmacy/interactions')).toBe(true);
    expect(can('DOCTOR', 'GET', '/items')).toBe(true);
    expect(can('DOCTOR', 'GET', '/appointments')).toBe(true);
    expect(can('DOCTOR', 'PATCH', '/prescriptions/rx-1/cancel')).toBe(true);
  });

  it('does not dispense, sell, or reach money and staff', () => {
    expect(can('DOCTOR', 'PATCH', '/prescriptions/rx-1/dispense')).toBe(false);
    expect(can('DOCTOR', 'PATCH', '/prescriptions/rx-1/refill')).toBe(false);
    expect(can('DOCTOR', 'POST', '/prescriptions/controlled-log')).toBe(false);
    expect(can('DOCTOR', 'POST', '/sales/checkout')).toBe(false);
    expect(can('DOCTOR', 'GET', '/reports/sales')).toBe(false);
    expect(can('DOCTOR', 'GET', '/hr/employees')).toBe(false);
    expect(can('DOCTOR', 'POST', '/pharmacy/drugs')).toBe(false);
    expect(can('DOCTOR', 'GET', '/pharmacy/claims')).toBe(false);
    expect(can('DOCTOR', 'POST', '/appointments')).toBe(false);
  });

  it('cannot switch a patient off or move records between patients', () => {
    expect(can('DOCTOR', 'PATCH', '/patients/pt-1/active')).toBe(false);
    expect(can('DOCTOR', 'POST', '/patients/pt-1/adopt-prescriptions')).toBe(false);
  });
});

describe('who can wait staff see patients', () => {
  it('waiters, kitchen, drivers and agents cannot', () => {
    for (const role of ['WAITER', 'KITCHEN', 'DRIVER', 'SALES_AGENT', 'ACCOUNTANT']) {
      expect(can(role, 'GET', '/patients')).toBe(false);
    }
  });
});

describe('assigning the roles', () => {
  it('both are assignable, by an owner or a manager', () => {
    expect(ASSIGNABLE_ROLES).toEqual(expect.arrayContaining(['PHARMACIST', 'DOCTOR']));
    expect(() => assertCanManageUser('OWNER', undefined, 'PHARMACIST')).not.toThrow();
    expect(() => assertCanManageUser('MANAGER', undefined, 'DOCTOR')).not.toThrow();
    expect(() => assertCanManageUser('PHARMACIST', undefined, 'DOCTOR')).toThrow();
  });
});

describe('visits', () => {
  it('the front line queues and bills; a doctor consults but never takes the money', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'DOCTOR', 'MANAGER', 'OWNER']) {
      expect(can(role, 'GET', '/visits')).toBe(true);
      expect(can(role, 'POST', '/visits')).toBe(true);
      expect(can(role, 'PATCH', '/visits/v-1/vitals')).toBe(true);
      expect(can(role, 'POST', '/visits/v-1/charges')).toBe(true);
    }
    for (const action of ['start', 'finish', 'reopen']) {
      expect(can('DOCTOR', 'POST', `/visits/v-1/${action}`)).toBe(true);
      expect(can('MANAGER', 'POST', `/visits/v-1/${action}`)).toBe(true);
      expect(can('CASHIER', 'POST', `/visits/v-1/${action}`)).toBe(false);
      expect(can('PHARMACIST', 'POST', `/visits/v-1/${action}`)).toBe(false);
    }
    expect(can('DOCTOR', 'PATCH', '/visits/v-1/consultation')).toBe(true);
    expect(can('CASHIER', 'PATCH', '/visits/v-1/consultation')).toBe(false);
    expect(can('CASHIER', 'POST', '/visits/v-1/complete')).toBe(true);
    expect(can('DOCTOR', 'POST', '/visits/v-1/complete')).toBe(false);
  });

  it('floor staff and the rest never see visits', () => {
    for (const role of ['WAITER', 'KITCHEN', 'DRIVER', 'SALES_AGENT', 'ACCOUNTANT']) expect(can(role, 'GET', '/visits')).toBe(false);
  });
});
