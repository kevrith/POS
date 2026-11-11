import { BadRequestException } from '@nestjs/common';
import { assertRestrictedAllowed, restrictedItems } from './restricted-sale';

const APPROVAL = { reason: 'Regular patient, prescriber phoned it through', approvedById: 'u-mgr', approvedByName: 'Grace' };
const PARA = { id: 'i1', name: 'Paracetamol', requiresPrescription: false, scheduleClass: 'OTC' };
const AMOX = { id: 'i2', name: 'Amoxicillin', requiresPrescription: true, scheduleClass: null };
const MORPH = { id: 'i3', name: 'Morphine', requiresPrescription: false, scheduleClass: 'II', unitLabel: 'ml' };

describe('restrictedItems', () => {
  it('picks prescription-only and controlled medicines, nothing else', () => {
    expect(restrictedItems([PARA, AMOX, MORPH, { id: 'i4', name: 'Soap' }]).map((r) => r.name)).toEqual(['Amoxicillin', 'Morphine']);
  });

  it('marks controlled ones and keeps their unit; lists a repeated item once', () => {
    const r = restrictedItems([MORPH, MORPH]);
    expect(r).toEqual([{ itemId: 'i3', name: 'Morphine', controlled: true, schedule: 'II', unit: 'ml' }]);
  });

  it('an ordinary business with nothing marked is untouched', () => {
    expect(restrictedItems([PARA, { id: 'x', name: 'Bread' }])).toEqual([]);
  });
});

describe('assertRestrictedAllowed', () => {
  it('lets an ordinary cart through', () => {
    expect(assertRestrictedAllowed([])).toBeNull();
  });

  it('refuses with a coded error naming the medicines', () => {
    const err: any = (() => { try { assertRestrictedAllowed(restrictedItems([AMOX, MORPH])); } catch (e) { return e; } })();
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'RESTRICTED_SALE', details: [expect.objectContaining({ name: 'Amoxicillin' }), expect.objectContaining({ name: 'Morphine' })] });
    expect(err.message).toMatch(/Amoxicillin, Morphine need a prescription/);
  });

  it('needs a real reason', () => {
    expect(() => assertRestrictedAllowed(restrictedItems([AMOX]), { ...APPROVAL, reason: 'ok' })).toThrow(/Say why/);
  });

  it('needs a patient name for a controlled drug, but not for a prescription-only one', () => {
    expect(() => assertRestrictedAllowed(restrictedItems([MORPH]), APPROVAL)).toThrow(/who it is being sold to/);
    expect(assertRestrictedAllowed(restrictedItems([AMOX]), APPROVAL)).toMatchObject({ approvedByName: 'Grace' });
    expect(assertRestrictedAllowed(restrictedItems([MORPH]), { ...APPROVAL, patientName: 'Jane Doe' })).toMatchObject({ patientName: 'Jane Doe' });
  });
});
