import { ApiError } from '../lib/api';
import { approvalBody, approvalReady, canApproveAlone, restrictedFrom } from '../lib/restricted';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

describe('restrictedFrom', () => {
  it('reads the medicines the server refused', () => {
    const err = new ApiError('needs a prescription', 400, 'RESTRICTED_SALE', [{ name: 'Amoxicillin', controlled: false }, { name: 'Morphine', controlled: true }]);
    expect(restrictedFrom(err)).toEqual([{ name: 'Amoxicillin', controlled: false }, { name: 'Morphine', controlled: true }]);
  });
  it('is null for any other error', () => {
    expect(restrictedFrom(new ApiError('nope', 400, 'OTHER'))).toBeNull();
    expect(restrictedFrom(new Error('x'))).toBeNull();
    expect(restrictedFrom(undefined)).toBeNull();
  });
  it('copes with details that are not a list', () => {
    expect(restrictedFrom(new ApiError('x', 400, 'RESTRICTED_SALE', 'rubbish'))).toEqual([]);
  });
});

describe('approval', () => {
  it('managers, owners and pharmacists approve alone; a cashier needs a PIN', () => {
    for (const r of ['OWNER', 'manager', 'ADMIN', 'PHARMACIST']) expect(canApproveAlone(r)).toBe(true);
    for (const r of ['CASHIER', 'WAITER', undefined, null, '']) expect(canApproveAlone(r)).toBe(false);
  });

  it('needs a reason, a PIN for a cashier, and a person for a controlled drug', () => {
    expect(approvalReady({ reason: 'ok' }, 'MANAGER', false)).toBe(false);
    expect(approvalReady({ reason: 'Prescriber phoned it in' }, 'MANAGER', false)).toBe(true);
    expect(approvalReady({ reason: 'Prescriber phoned it in' }, 'CASHIER', false)).toBe(false);
    expect(approvalReady({ reason: 'Prescriber phoned it in', managerPin: '1234' }, 'CASHIER', false)).toBe(true);
    expect(approvalReady({ reason: 'Prescriber phoned it in', managerPin: '12' }, 'CASHIER', false)).toBe(false);
    expect(approvalReady({ reason: 'Prescriber phoned it in' }, 'MANAGER', true)).toBe(false);
    expect(approvalReady({ reason: 'Prescriber phoned it in', patientName: 'Jane' }, 'MANAGER', true)).toBe(true);
  });

  it('sends only what was filled in, trimmed', () => {
    expect(approvalBody({ reason: '  Regular patient ', managerPin: ' ', patientName: ' Jane ' })).toEqual({ reason: 'Regular patient', managerPin: undefined, patientName: 'Jane', patientIdNumber: undefined, prescriberName: undefined });
  });
});
