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

describe('insurance cover and claims', () => {
  it('whoever registers or bills the patient can check cover', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'MANAGER', 'OWNER']) {
      expect(can(role, 'POST', '/cover/checks')).toBe(true);
      expect(can(role, 'GET', '/cover/checks')).toBe(true);
    }
    for (const role of ['WAITER', 'KITCHEN', 'DRIVER', 'ACCOUNTANT']) expect(can(role, 'POST', '/cover/checks')).toBe(false);
  });

  it('the claims board is for management and the accountant only', () => {
    for (const role of ['OWNER', 'MANAGER', 'ACCOUNTANT']) {
      expect(can(role, 'GET', '/cover/claims')).toBe(true);
      expect(can(role, 'GET', '/cover/claims/aging')).toBe(true);
      expect(can(role, 'GET', '/cover/claims/c-1')).toBe(true);
    }
    for (const role of ['CASHIER', 'PHARMACIST', 'DOCTOR']) expect(can(role, 'GET', '/cover/claims')).toBe(false);
  });
});

describe('lab', () => {
  it('a doctor or manager orders; a lab technician cannot', () => {
    for (const role of ['DOCTOR', 'MANAGER', 'OWNER']) expect(can(role, 'POST', '/lab/orders')).toBe(true);
    for (const role of ['LAB_TECH', 'CASHIER', 'PHARMACIST', 'WAITER']) expect(can(role, 'POST', '/lab/orders')).toBe(false);
  });

  it('anyone clinical collects the specimen, including the lab technician', () => {
    for (const role of ['LAB_TECH', 'CASHIER', 'PHARMACIST', 'DOCTOR', 'MANAGER']) expect(can(role, 'POST', '/lab/orders/o-1/collect')).toBe(true);
    for (const role of ['WAITER', 'KITCHEN', 'ACCOUNTANT']) expect(can(role, 'POST', '/lab/orders/o-1/collect')).toBe(false);
  });

  it('only the lab technician and management enter results; a doctor, cashier or pharmacist cannot', () => {
    for (const role of ['LAB_TECH', 'MANAGER', 'OWNER']) expect(can(role, 'PATCH', '/lab/orders/o-1/items/i-1/results')).toBe(true);
    for (const role of ['DOCTOR', 'CASHIER', 'PHARMACIST']) expect(can(role, 'PATCH', '/lab/orders/o-1/items/i-1/results')).toBe(false);
  });

  it('a doctor can release a result; sending one back for correction and the catalogue are management\'s', () => {
    expect(can('DOCTOR', 'POST', '/lab/orders/o-1/items/i-1/verify')).toBe(true);
    expect(can('LAB_TECH', 'POST', '/lab/orders/o-1/items/i-1/verify')).toBe(true);
    expect(can('CASHIER', 'POST', '/lab/orders/o-1/items/i-1/verify')).toBe(false);
    for (const role of ['DOCTOR', 'LAB_TECH', 'CASHIER']) {
      expect(can(role, 'POST', '/lab/orders/o-1/items/i-1/reopen')).toBe(false);
      expect(can(role, 'POST', '/lab/tests')).toBe(false);
      expect(can(role, 'PATCH', '/lab/tests/t-1')).toBe(false);
      expect(can(role, 'POST', '/lab/tests/starter')).toBe(false);
    }
    expect(can('MANAGER', 'POST', '/lab/orders/o-1/items/i-1/reopen')).toBe(true);
    expect(can('MANAGER', 'POST', '/lab/tests')).toBe(true);
  });

  it('a lab technician sees the lab and nothing else', () => {
    expect(can('LAB_TECH', 'GET', '/lab/board')).toBe(true);
    for (const path of ['/patients', '/visits', '/sales', '/items', '/prescriptions', '/reports/summary', '/hr/employees', '/cover/claims']) expect(can('LAB_TECH', 'GET', path)).toBe(false);
  });

  it('the front line may read the lab; floor staff may not', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'DOCTOR', 'LAB_TECH']) expect(can(role, 'GET', '/lab/board')).toBe(true);
    for (const role of ['WAITER', 'KITCHEN', 'DRIVER', 'ACCOUNTANT']) expect(can(role, 'GET', '/lab/board')).toBe(false);
  });
});

describe('nurse', () => {
  it('registers and queues patients, takes vitals, takes specimens and reads the record', () => {
    expect(can('NURSE', 'GET', '/patients')).toBe(true);
    expect(can('NURSE', 'POST', '/patients')).toBe(true);
    expect(can('NURSE', 'PATCH', '/patients/p-1')).toBe(true);
    expect(can('NURSE', 'GET', '/visits')).toBe(true);
    expect(can('NURSE', 'POST', '/visits')).toBe(true);
    expect(can('NURSE', 'PATCH', '/visits/v-1/vitals')).toBe(true);
    expect(can('NURSE', 'GET', '/prescriptions')).toBe(true);
    expect(can('NURSE', 'GET', '/lab/board')).toBe(true);
    expect(can('NURSE', 'POST', '/lab/orders/o-1/collect')).toBe(true);
  });

  it('does not consult, prescribe, bill, cancel, order tests or enter results', () => {
    for (const action of ['start', 'finish', 'reopen', 'complete', 'cancel', 'charges']) expect(can('NURSE', 'POST', `/visits/v-1/${action}`)).toBe(false);
    expect(can('NURSE', 'PATCH', '/visits/v-1/consultation')).toBe(false);
    expect(can('NURSE', 'POST', '/prescriptions')).toBe(false);
    expect(can('NURSE', 'PATCH', '/prescriptions/rx-1/dispense')).toBe(false);
    expect(can('NURSE', 'POST', '/lab/orders')).toBe(false);
    expect(can('NURSE', 'PATCH', '/lab/orders/o-1/items/i-1/results')).toBe(false);
    expect(can('NURSE', 'POST', '/lab/orders/o-1/items/i-1/verify')).toBe(false);
    expect(can('NURSE', 'POST', '/cover/checks')).toBe(false);
  });

  it('sees nothing outside the clinic: no till, money, reports, staff or claims', () => {
    for (const path of ['/sales', '/items', '/reports/summary', '/hr/employees', '/cover/claims', '/pharmacy/drugs', '/clinic/reports/summary']) expect(can('NURSE', 'GET', path)).toBe(false);
    expect(can('NURSE', 'POST', '/sales/checkout')).toBe(false);
  });

  it('is an assignable role that a manager can create', () => {
    expect(ASSIGNABLE_ROLES).toContain('NURSE');
    expect(() => assertCanManageUser('MANAGER', undefined, 'NURSE')).not.toThrow();
  });
});

describe('clinic reports', () => {
  it('are for management only', () => {
    for (const role of ['OWNER', 'MANAGER']) expect(can(role, 'GET', '/clinic/reports/summary')).toBe(true);
    for (const role of ['DOCTOR', 'CASHIER', 'PHARMACIST', 'LAB_TECH', 'ACCOUNTANT', 'WAITER']) expect(can(role, 'GET', '/clinic/reports/summary')).toBe(false);
  });
});

describe('compliance exports', () => {
  it('are for management and the pharmacist', () => {
    for (const role of ['OWNER', 'MANAGER', 'PHARMACIST']) {
      expect(can(role, 'GET', '/compliance/controlled-register')).toBe(true);
      expect(can(role, 'GET', '/compliance/patients/p-1/export')).toBe(true);
    }
    for (const role of ['CASHIER', 'DOCTOR', 'NURSE', 'LAB_TECH', 'ACCOUNTANT', 'WAITER']) {
      expect(can(role, 'GET', '/compliance/controlled-register')).toBe(false);
      expect(can(role, 'GET', '/compliance/patients/p-1/export')).toBe(false);
    }
  });
});

describe('checking an appointment in as a visit', () => {
  it('is the front desk\'s, not the nurse\'s or a lab technician\'s', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'MANAGER', 'OWNER']) expect(can(role, 'POST', '/visits/from-appointment/ap-1')).toBe(true);
    for (const role of ['NURSE', 'LAB_TECH', 'WAITER', 'ACCOUNTANT']) expect(can(role, 'POST', '/visits/from-appointment/ap-1')).toBe(false);
  });
});

describe('resubmitting a claim', () => {
  it('is for management and the accountant, like the claims', () => {
    for (const role of ['OWNER', 'MANAGER', 'ACCOUNTANT']) expect(can(role, 'POST', '/cover/claims/c-1/resubmit')).toBe(true);
    for (const role of ['CASHIER', 'PHARMACIST', 'DOCTOR', 'NURSE']) expect(can(role, 'POST', '/cover/claims/c-1/resubmit')).toBe(false);
  });
  it('and the follow-up reminders are the front desk\'s', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'MANAGER']) expect(can(role, 'POST', '/visits/v-1/follow-up/remind')).toBe(true);
    for (const role of ['NURSE', 'LAB_TECH', 'WAITER']) expect(can(role, 'POST', '/visits/v-1/follow-up/remind')).toBe(false);
    expect(can('NURSE', 'GET', '/visits/follow-ups')).toBe(true);
  });
  it('a clinician acknowledges a critical result; a technician does not', () => {
    for (const role of ['DOCTOR', 'MANAGER']) expect(can(role, 'POST', '/lab/orders/o-1/items/i-1/acknowledge')).toBe(true);
    for (const role of ['LAB_TECH', 'CASHIER', 'NURSE']) expect(can(role, 'POST', '/lab/orders/o-1/items/i-1/acknowledge')).toBe(false);
  });
});

describe('SHA connection', () => {
  it('the owner or a manager sets it up and tests it; nobody else can even read the settings', () => {
    for (const role of ['OWNER', 'MANAGER']) {
      expect(can(role, 'PUT', '/cover/sha/config')).toBe(true);
      expect(can(role, 'DELETE', '/cover/sha/config')).toBe(true);
      expect(can(role, 'GET', '/cover/sha/config')).toBe(true);
      expect(can(role, 'POST', '/cover/sha/test')).toBe(true);
    }
    for (const role of ['CASHIER', 'PHARMACIST', 'DOCTOR', 'NURSE', 'ACCOUNTANT', 'LAB_TECH']) {
      expect(can(role, 'PUT', '/cover/sha/config')).toBe(false);
      expect(can(role, 'GET', '/cover/sha/config')).toBe(false);
      expect(can(role, 'POST', '/cover/sha/test')).toBe(false);
    }
  });

  it('the front line can see whether it is connected and ask SHA about a patient', () => {
    for (const role of ['CASHIER', 'PHARMACIST', 'MANAGER', 'OWNER']) {
      expect(can(role, 'GET', '/cover/sha/status')).toBe(true);
      expect(can(role, 'POST', '/cover/sha/eligibility')).toBe(true);
    }
    for (const role of ['WAITER', 'KITCHEN', 'NURSE', 'LAB_TECH', 'ACCOUNTANT']) expect(can(role, 'POST', '/cover/sha/eligibility')).toBe(false);
  });
});

describe('a pharmacist and the supplier side', () => {
  it('receives deliveries and sends stock back, and can read suppliers and orders', () => {
    for (const [m, p] of [['GET', '/suppliers'], ['GET', '/suppliers/purchase-orders'], ['GET', '/suppliers/purchase-orders/po-1'], ['POST', '/suppliers/purchase-orders/po-1/grn'], ['GET', '/suppliers/returns'], ['POST', '/suppliers/returns'], ['PATCH', '/suppliers/returns/r-1/status']] as const) {
      expect(can('PHARMACIST', m, p)).toBe(true);
    }
  });
  it('does not order, approve, invoice or handle credit', () => {
    for (const [m, p] of [['POST', '/suppliers/purchase-orders'], ['PATCH', '/suppliers/purchase-orders/po-1/status'], ['PATCH', '/suppliers/purchase-orders/po-1/invoice'], ['GET', '/suppliers/invoices'], ['GET', '/suppliers/credit-notes'], ['POST', '/suppliers/credit-notes'], ['POST', '/suppliers']] as const) {
      expect(can('PHARMACIST', m, p)).toBe(false);
    }
  });
  it('a cashier gets none of it', () => {
    expect(can('CASHIER', 'GET', '/suppliers')).toBe(false);
    expect(can('CASHIER', 'POST', '/suppliers/purchase-orders/po-1/grn')).toBe(false);
    expect(can('CASHIER', 'POST', '/suppliers/returns')).toBe(false);
  });
});

describe('insurer tariffs', () => {
  it('are set by the owner or a manager; the front line only sees a visit\'s quote', () => {
    for (const role of ['OWNER', 'MANAGER']) { expect(can(role, 'GET', '/cover/tariffs')).toBe(true); expect(can(role, 'PUT', '/cover/tariffs')).toBe(true); expect(can(role, 'DELETE', '/cover/tariffs/t-1')).toBe(true); }
    for (const role of ['CASHIER', 'PHARMACIST', 'ACCOUNTANT', 'DOCTOR']) { expect(can(role, 'PUT', '/cover/tariffs')).toBe(false); expect(can(role, 'GET', '/cover/tariffs')).toBe(false); }
    for (const role of ['CASHIER', 'PHARMACIST', 'MANAGER']) expect(can(role, 'GET', '/cover/quote')).toBe(true);
  });
});
