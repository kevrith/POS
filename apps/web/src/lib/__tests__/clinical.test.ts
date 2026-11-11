import { describe, expect, it } from 'vitest';
import { allergyLine, canApproveAlone, frequencyLabel, overridePayload, overrideReady } from '../clinical';

describe('overrides', () => {
  it('a manager needs only a reason; anyone else needs a PIN too', () => {
    expect(overrideReady({ reason: 'Prescriber confirmed', pin: '' }, 'MANAGER')).toBe(true);
    expect(overrideReady({ reason: 'Prescriber confirmed', pin: '' }, 'CASHIER')).toBe(false);
    expect(overrideReady({ reason: 'Prescriber confirmed', pin: '1234' }, 'CASHIER')).toBe(true);
    expect(overrideReady({ reason: 'ok', pin: '1234' }, 'CASHIER')).toBe(false);
  });

  it('sends the PIN only when a non-manager typed one', () => {
    expect(overridePayload({ reason: ' because ', pin: '1234' }, 'CASHIER')).toEqual({ reason: 'because', managerPin: '1234' });
    expect(overridePayload({ reason: 'because', pin: '1234' }, 'OWNER')).toEqual({ reason: 'because' });
  });

  it('knows who can approve alone', () => {
    expect(['OWNER', 'ADMIN', 'MANAGER'].every(canApproveAlone)).toBe(true);
    expect(canApproveAlone('CASHIER')).toBe(false);
    expect(canApproveAlone(undefined)).toBe(false);
  });
});

describe('labels', () => {
  it('reads old spellings of a frequency', () => {
    expect(frequencyLabel('QID')).toBe('QDS');
    expect(frequencyLabel('ON')).toBe('At night');
    expect(frequencyLabel('bd')).toBe('BD');
  });
  it('summarises allergies', () => {
    expect(allergyLine([{ substance: 'Penicillin', reaction: 'rash' }, { substance: 'Sulfa' }])).toBe('Penicillin (rash), Sulfa');
  });
});

import { doctorLabel } from '../clinical';
describe('doctorLabel', () => {
  it('adds the title once', () => {
    expect(doctorLabel('Mwangi')).toBe('Dr. Mwangi');
    expect(doctorLabel('Dr. Mwangi')).toBe('Dr. Mwangi');
    expect(doctorLabel('dr Mwangi')).toBe('dr Mwangi');
    expect(doctorLabel('Drake')).toBe('Dr. Drake');
  });
});
